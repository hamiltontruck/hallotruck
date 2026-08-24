create table if not exists public.driver_commission_deposits (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  amount_etb numeric(14,2) not null check (amount_etb > 0),
  note text,
  status text not null default 'active' check (status in ('active','reversed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id),
  reversed_at timestamptz
);

create index if not exists driver_commission_deposits_driver_idx
  on public.driver_commission_deposits(driver_id, created_at desc);

alter table public.driver_commission_deposits enable row level security;

create policy driver_commission_deposits_read
on public.driver_commission_deposits for select to authenticated
using (
  driver_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') in ('admin','ceo')
);

create policy driver_commission_deposits_admin_write
on public.driver_commission_deposits for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') in ('admin','ceo'))
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') in ('admin','ceo'));

create or replace function public.admin_add_driver_commission_deposit(
  p_driver_id uuid,
  p_amount_etb numeric,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role','');
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if v_actor is null or v_role not in ('admin','ceo') then raise exception 'Admin or CEO role required'; end if;
  if p_amount_etb is null or p_amount_etb <= 0 then raise exception 'Deposit amount must be greater than zero'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'Deposit note must be 500 characters or fewer'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver') then raise exception 'Driver not found'; end if;

  insert into public.driver_commission_deposits(driver_id, amount_etb, note, created_by)
  values (p_driver_id, round(p_amount_etb,2), v_note, v_actor)
  returning id into v_id;

  insert into public.driver_commission_audit(driver_id, action, actor_id, details)
  values (p_driver_id, 'deposit_added', v_actor,
    jsonb_build_object('deposit_id',v_id,'amount_etb',round(p_amount_etb,2),'note',v_note));
  return v_id;
end;
$$;

create or replace function public.admin_reverse_driver_commission_deposit(
  p_deposit_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role','');
  v_driver uuid;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if v_actor is null or v_role not in ('admin','ceo') then raise exception 'Admin or CEO role required'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Reversal reason must be at least 5 characters'; end if;

  update public.driver_commission_deposits
  set status='reversed', reversed_by=v_actor, reversed_at=now(), note=coalesce(note,'') || E'\nReversal: ' || v_reason
  where id=p_deposit_id and status='active'
  returning driver_id into v_driver;

  if v_driver is null then raise exception 'Active deposit not found'; end if;
  insert into public.driver_commission_audit(driver_id, action, actor_id, details)
  values (v_driver, 'deposit_reversed', v_actor,
    jsonb_build_object('deposit_id',p_deposit_id,'reason',v_reason));
end;
$$;

create or replace function public.driver_commission_balance(p_driver_id uuid)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role', '');
  v_balance numeric;
begin
  if v_uid is null and v_role <> 'service_role' then raise exception 'Authentication required'; end if;
  if p_driver_id is distinct from v_uid and v_role not in ('admin','ceo','service_role') then
    raise exception 'You can only view your own commission balance';
  end if;

  select greatest(0,
    coalesce((select sum(c.commission_etb) from public.driver_commission_charges c where c.driver_id=p_driver_id and c.status='active'),0)
    - coalesce((select sum(p.amount_etb) from public.driver_commission_payments p where p.driver_id=p_driver_id and p.status='approved'),0)
    - coalesce((select sum(d.amount_etb) from public.driver_commission_deposits d where d.driver_id=p_driver_id and d.status='active'),0)
  ) into v_balance;
  return v_balance;
end;
$$;

create or replace function public.driver_financial_summary(p_driver_id uuid)
returns table(
  completed_trips bigint,
  gross_released_etb numeric,
  commission_charged_etb numeric,
  commission_paid_etb numeric,
  admin_deposit_etb numeric,
  available_deposit_etb numeric,
  commission_due_etb numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role', '');
begin
  if v_uid is null and v_role <> 'service_role' then raise exception 'Authentication required'; end if;
  if p_driver_id is distinct from v_uid and v_role not in ('admin','ceo','service_role') then
    raise exception 'You can only view your own financial summary';
  end if;

  return query
  with vals as (
    select
      (select count(*) from public.orders o where o.driver_id=p_driver_id and o.status='delivered')::bigint as trips,
      coalesce((select sum(p.amount_etb) from public.payments p join public.orders o on o.id=p.order_id where o.driver_id=p_driver_id and p.event='released'),0)::numeric as gross,
      coalesce((select sum(c.commission_etb) from public.driver_commission_charges c where c.driver_id=p_driver_id and c.status='active'),0)::numeric as charged,
      coalesce((select sum(cp.amount_etb) from public.driver_commission_payments cp where cp.driver_id=p_driver_id and cp.status='approved'),0)::numeric as paid,
      coalesce((select sum(d.amount_etb) from public.driver_commission_deposits d where d.driver_id=p_driver_id and d.status='active'),0)::numeric as deposited
  )
  select trips, gross, charged, paid, deposited,
    greatest(0, paid + deposited - charged),
    greatest(0, charged - paid - deposited)
  from vals;
end;
$$;

grant execute on function public.admin_add_driver_commission_deposit(uuid,numeric,text) to authenticated;
grant execute on function public.admin_reverse_driver_commission_deposit(uuid,text) to authenticated;
grant execute on function public.driver_financial_summary(uuid) to authenticated;

create or replace function public.driver_submit_collected_payment(
  p_order_id uuid,
  p_collection_method text,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_receipt_path text,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_driver_id uuid := auth.uid();
  v_order_driver uuid;
  v_order_status public.order_status;
  v_order_total numeric;
  v_tracking_id text;
  v_payment_terms text;
  v_method text := lower(btrim(coalesce(p_collection_method, '')));
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_provider_ref text := nullif(btrim(coalesce(p_provider_ref, '')), '');
  v_receipt_path text := nullif(btrim(coalesce(p_receipt_path, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payment_id uuid;
  v_allowed_bank_providers constant text[] := array['telebirr','cbe','awash_bank','bank_of_abyssinia','dashen_bank','coop_bank_oromia','mpesa','other_bank'];
begin
  if v_driver_id is null then raise exception 'Driver sign-in required'; end if;
  if not public.is_approved_driver() then raise exception 'Approved driver account required'; end if;

  select o.driver_id,o.status,coalesce(o.price_etb,0),o.tracking_id,o.payment_terms
  into v_order_driver,v_order_status,v_order_total,v_tracking_id,v_payment_terms
  from public.orders o where o.id=p_order_id for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order_driver is distinct from v_driver_id then raise exception 'Only the assigned driver can report this payment'; end if;
  if v_order_status <> 'delivered' then raise exception 'Payment collection can only be reported after delivery'; end if;
  if v_order_total <= 0 then raise exception 'Order invoice total is invalid'; end if;
  if p_amount_etb is null or abs(p_amount_etb-v_order_total)>0.005 then
    raise exception 'Partial payment is not enabled. Report the full invoice amount of ETB %',v_order_total;
  end if;
  if v_method not in ('cash','bank') then raise exception 'Collection method must be cash or bank'; end if;

  if v_method='cash' then
    v_provider := 'cash_to_driver';
    v_provider_ref := null;
    v_receipt_path := null;
    v_note := null;
  else
    if not (v_provider = any(v_allowed_bank_providers)) then raise exception 'Select a supported bank or mobile payment provider'; end if;
    if v_provider_ref is null then raise exception 'Transaction ID is required for bank or mobile payment'; end if;
    if v_receipt_path is null or split_part(v_receipt_path,'/',1) <> v_driver_id::text then raise exception 'Invalid payment evidence path'; end if;
    if not exists(select 1 from storage.objects so where so.bucket_id='payment-receipts' and so.name=v_receipt_path) then raise exception 'Payment evidence upload was not found'; end if;
  end if;

  if v_note is not null and char_length(v_note)>500 then raise exception 'Collection note must be 500 characters or fewer'; end if;

  select p.id into v_payment_id from public.payments p
  where p.order_id=p_order_id and p.event in ('initiated','held_escrow','released')
  order by p.created_at desc limit 1 for update;
  if v_payment_id is not null then raise exception 'A payment is already submitted or verified for this order'; end if;

  select p.id into v_payment_id from public.payments p
  where p.order_id=p_order_id and p.event='failed' and coalesce(p.raw_payload->>'source','')='driver_collection'
  order by p.created_at desc limit 1 for update;

  if v_payment_id is not null then
    update public.payments set provider=v_provider,provider_ref=v_provider_ref,amount_etb=v_order_total,event='initiated',receipt_path=v_receipt_path,
      raw_payload=jsonb_strip_nulls(jsonb_build_object('source','driver_collection','collection_method',v_method,'collected_by',v_driver_id,'direct_to_driver',true,'note',v_note,'tracking_id',v_tracking_id,'payment_terms',v_payment_terms))
    where id=v_payment_id;
  else
    insert into public.payments(order_id,provider,provider_ref,amount_etb,event,receipt_path,raw_payload)
    values(p_order_id,v_provider,v_provider_ref,v_order_total,'initiated',v_receipt_path,
      jsonb_strip_nulls(jsonb_build_object('source','driver_collection','collection_method',v_method,'collected_by',v_driver_id,'direct_to_driver',true,'note',v_note,'tracking_id',v_tracking_id,'payment_terms',v_payment_terms)))
    returning id into v_payment_id;
  end if;

  update public.orders set payment_provider=v_provider,payment_ref=v_provider_ref where id=p_order_id;
  return v_payment_id;
end;
$$;
