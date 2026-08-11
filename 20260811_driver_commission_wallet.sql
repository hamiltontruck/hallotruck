-- HALLO Smart Freight driver commission wallet.
-- Cash paid directly to a driver creates a 2% HALLO Smart commission charge.
-- Drivers may settle the balance through bank/mobile-money evidence; Admin/CEO must approve it.

create table if not exists public.driver_commission_charges (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  gross_etb numeric not null check (gross_etb > 0),
  commission_percent numeric not null default 2 check (commission_percent >= 0 and commission_percent <= 100),
  commission_etb numeric not null check (commission_etb > 0),
  status text not null default 'active' check (status in ('active','reversed')),
  source text not null default 'cash_to_driver',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_id)
);

create table if not exists public.driver_commission_payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  transaction_id text not null,
  amount_etb numeric not null check (amount_etb > 0),
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists driver_commission_transaction_unique
  on public.driver_commission_payments (lower(btrim(transaction_id)));
create index if not exists driver_commission_charges_driver_idx on public.driver_commission_charges(driver_id, created_at desc);
create index if not exists driver_commission_payments_driver_idx on public.driver_commission_payments(driver_id, submitted_at desc);
create index if not exists driver_commission_payments_status_idx on public.driver_commission_payments(status, submitted_at desc);

create table if not exists public.driver_commission_audit (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  commission_payment_id uuid references public.driver_commission_payments(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.driver_commission_charges enable row level security;
alter table public.driver_commission_payments enable row level security;
alter table public.driver_commission_audit enable row level security;

drop policy if exists "drivers read own commission charges" on public.driver_commission_charges;
create policy "drivers read own commission charges" on public.driver_commission_charges
for select to authenticated using (
  driver_id = auth.uid() or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo')
);

drop policy if exists "drivers read own commission payments" on public.driver_commission_payments;
create policy "drivers read own commission payments" on public.driver_commission_payments
for select to authenticated using (
  driver_id = auth.uid() or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo')
);

drop policy if exists "commission audit admin or own driver" on public.driver_commission_audit;
create policy "commission audit admin or own driver" on public.driver_commission_audit
for select to authenticated using (
  driver_id = auth.uid() or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo')
);

create or replace function public.driver_commission_balance(p_driver_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    0,
    coalesce((select sum(c.commission_etb) from public.driver_commission_charges c where c.driver_id = p_driver_id and c.status = 'active'), 0)
    - coalesce((select sum(p.amount_etb) from public.driver_commission_payments p where p.driver_id = p_driver_id and p.status = 'approved'), 0)
  );
$$;

create or replace function public.my_driver_commission_summary()
returns table (
  balance_etb numeric,
  charged_etb numeric,
  approved_paid_etb numeric,
  pending_etb numeric,
  blocked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  return query
  select
    public.driver_commission_balance(uid),
    coalesce((select sum(c.commission_etb) from public.driver_commission_charges c where c.driver_id=uid and c.status='active'),0),
    coalesce((select sum(p.amount_etb) from public.driver_commission_payments p where p.driver_id=uid and p.status='approved'),0),
    coalesce((select sum(p.amount_etb) from public.driver_commission_payments p where p.driver_id=uid and p.status='pending'),0),
    public.driver_commission_balance(uid) > 0.005;
end;
$$;

create or replace function public.submit_driver_commission_payment(
  p_provider text,
  p_transaction_id text,
  p_amount_etb numeric,
  p_receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  due numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if nullif(btrim(p_provider),'') is null then raise exception 'Payment provider is required'; end if;
  if nullif(btrim(p_transaction_id),'') is null then raise exception 'Transaction ID is required'; end if;
  if nullif(btrim(p_receipt_path),'') is null then raise exception 'Receipt screenshot or PDF is required'; end if;
  if p_amount_etb <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  due := public.driver_commission_balance(uid);
  if due <= 0.005 then raise exception 'No commission balance is due'; end if;
  if p_amount_etb > due + 0.005 then raise exception 'Payment cannot exceed the commission balance'; end if;

  insert into public.driver_commission_payments(driver_id,provider,transaction_id,amount_etb,receipt_path)
  values(uid,btrim(p_provider),btrim(p_transaction_id),p_amount_etb,btrim(p_receipt_path))
  returning id into new_id;

  insert into public.driver_commission_audit(driver_id,commission_payment_id,action,actor_id,details)
  values(uid,new_id,'submitted',uid,jsonb_build_object('provider',btrim(p_provider),'transaction_id',btrim(p_transaction_id),'amount_etb',p_amount_etb));
  return new_id;
exception
  when unique_violation then
    raise exception 'This transaction ID has already been used';
end;
$$;

create or replace function public.admin_review_driver_commission_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  row_data public.driver_commission_payments%rowtype;
  due numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select * into row_data from public.driver_commission_payments where id=p_payment_id for update;
  if not found then raise exception 'Commission payment not found'; end if;
  if row_data.status <> 'pending' then raise exception 'Only pending commission payments can be reviewed'; end if;

  if p_approve then
    due := public.driver_commission_balance(row_data.driver_id);
    if row_data.amount_etb > due + 0.005 then raise exception 'Payment exceeds the remaining commission balance'; end if;
    update public.driver_commission_payments
      set status='approved', rejection_reason=null, reviewed_by=uid, reviewed_at=now(), updated_at=now()
      where id=p_payment_id;
    insert into public.driver_commission_audit(driver_id,commission_payment_id,action,actor_id,details)
      values(row_data.driver_id,p_payment_id,'approved',uid,jsonb_build_object('amount_etb',row_data.amount_etb,'provider',row_data.provider,'transaction_id',row_data.transaction_id));
  else
    if nullif(btrim(coalesce(p_rejection_reason,'')),'') is null then raise exception 'Rejection reason is required'; end if;
    update public.driver_commission_payments
      set status='rejected', rejection_reason=btrim(p_rejection_reason), reviewed_by=uid, reviewed_at=now(), updated_at=now()
      where id=p_payment_id;
    insert into public.driver_commission_audit(driver_id,commission_payment_id,action,actor_id,details)
      values(row_data.driver_id,p_payment_id,'rejected',uid,jsonb_build_object('reason',btrim(p_rejection_reason),'amount_etb',row_data.amount_etb));
  end if;
end;
$$;

create or replace function public.sync_cash_driver_commission_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_driver uuid;
begin
  if lower(replace(btrim(new.provider),' ','_')) in ('cash','cash_to_driver','driver_cash') then
    select o.driver_id into order_driver from public.orders o where o.id=new.order_id;
    if new.event = 'released' and order_driver is not null then
      insert into public.driver_commission_charges(driver_id,order_id,payment_id,gross_etb,commission_etb,status,source,updated_at)
      values(order_driver,new.order_id,new.id,new.amount_etb,round(new.amount_etb*0.02,2),'active','cash_to_driver',now())
      on conflict(payment_id) do update set driver_id=excluded.driver_id,gross_etb=excluded.gross_etb,commission_etb=excluded.commission_etb,status='active',updated_at=now();
    elsif new.event in ('refunded','failed') then
      update public.driver_commission_charges set status='reversed',updated_at=now() where payment_id=new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_cash_driver_commission_charge on public.payments;
create trigger trg_sync_cash_driver_commission_charge
after insert or update of event,provider,amount_etb on public.payments
for each row execute function public.sync_cash_driver_commission_charge();

-- Backfill any already-released cash-to-driver payments.
insert into public.driver_commission_charges(driver_id,order_id,payment_id,gross_etb,commission_etb,status,source)
select o.driver_id,p.order_id,p.id,p.amount_etb,round(p.amount_etb*0.02,2),'active','cash_to_driver'
from public.payments p join public.orders o on o.id=p.order_id
where p.event='released' and o.driver_id is not null
  and lower(replace(btrim(p.provider),' ','_')) in ('cash','cash_to_driver','driver_cash')
on conflict(payment_id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('driver-commission-receipts','driver-commission-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "driver commission receipt upload" on storage.objects;
create policy "driver commission receipt upload" on storage.objects
for insert to authenticated with check (
  bucket_id='driver-commission-receipts' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "driver commission receipt read" on storage.objects;
create policy "driver commission receipt read" on storage.objects
for select to authenticated using (
  bucket_id='driver-commission-receipts' and (
    (storage.foldername(name))[1]=auth.uid()::text or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo')
  )
);

revoke all on function public.driver_commission_balance(uuid) from public,anon;
revoke all on function public.my_driver_commission_summary() from public,anon;
revoke all on function public.submit_driver_commission_payment(text,text,numeric,text) from public,anon;
revoke all on function public.admin_review_driver_commission_payment(uuid,boolean,text) from public,anon;
grant execute on function public.driver_commission_balance(uuid) to authenticated;
grant execute on function public.my_driver_commission_summary() to authenticated;
grant execute on function public.submit_driver_commission_payment(text,text,numeric,text) to authenticated;
grant execute on function public.admin_review_driver_commission_payment(uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';
