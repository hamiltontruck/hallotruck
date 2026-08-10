-- Professional customer payments + profile foundation.
-- Apply separately after merge.

alter table public.profiles
  add column if not exists customer_type text not null default 'individual',
  add column if not exists company_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_customer_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_customer_type_check
      check (customer_type in ('individual','business'));
  end if;
end $$;

alter table public.payments
  add column if not exists receipt_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment receipts customer own read" on storage.objects;
create policy "payment receipts customer own read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "payment receipts customer own insert" on storage.objects;
create policy "payment receipts customer own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "payment receipts customer cleanup" on storage.objects;
create policy "payment receipts customer cleanup"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and split_part(name, '/', 1) = auth.uid()::text
    and not exists (
      select 1 from public.payments p where p.receipt_path = name
    )
  );

drop policy if exists "payment receipts leadership read" on storage.objects;
create policy "payment receipts leadership read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo')
  );

create or replace function public.customer_submit_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_receipt_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_price numeric;
  v_committed numeric := 0;
  v_remaining numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select customer_id, price_etb
    into v_customer_id, v_price
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_customer_id <> auth.uid() then
    raise exception 'You can only submit payment for your own order';
  end if;

  if nullif(btrim(p_provider), '') is null then
    raise exception 'Payment provider is required';
  end if;

  if nullif(btrim(p_provider_ref), '') is null then
    raise exception 'Transaction reference is required';
  end if;

  if p_amount_etb <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if nullif(btrim(p_receipt_path), '') is null then
    raise exception 'Payment receipt is required';
  end if;

  if split_part(btrim(p_receipt_path), '/', 1) <> auth.uid()::text then
    raise exception 'Invalid payment receipt path';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'payment-receipts'
      and so.name = btrim(p_receipt_path)
  ) then
    raise exception 'Payment receipt upload was not found';
  end if;

  select coalesce(sum(
    case
      when p.event in ('initiated','held_escrow','released') then p.amount_etb
      when p.event = 'refunded' and p.provider = 'credit_refund' then -p.amount_etb
      else 0
    end
  ), 0)
  into v_committed
  from public.payments p
  where p.order_id = p_order_id;

  v_remaining := greatest(0, coalesce(v_price, 0) - v_committed);

  if p_amount_etb > v_remaining then
    raise exception 'Payment amount exceeds the remaining invoice balance of ETB %', v_remaining;
  end if;

  if exists (
    select 1
    from public.payments
    where provider = btrim(p_provider)
      and provider_ref = btrim(p_provider_ref)
  ) then
    raise exception 'Transaction ID already exists for this provider: %', btrim(p_provider_ref);
  end if;

  insert into public.payments (
    order_id,
    provider,
    provider_ref,
    amount_etb,
    event,
    receipt_path,
    raw_payload
  ) values (
    p_order_id,
    btrim(p_provider),
    btrim(p_provider_ref),
    p_amount_etb,
    'initiated',
    btrim(p_receipt_path),
    jsonb_build_object(
      'submitted_by', auth.uid(),
      'source', 'customer_portal',
      'receipt_path', btrim(p_receipt_path)
    )
  );

  update public.orders
  set payment_provider = btrim(p_provider),
      payment_ref = btrim(p_provider_ref)
  where id = p_order_id;
end;
$$;

revoke all on function public.customer_submit_payment(uuid,text,text,numeric,text) from public, anon;
grant execute on function public.customer_submit_payment(uuid,text,text,numeric,text) to authenticated;
