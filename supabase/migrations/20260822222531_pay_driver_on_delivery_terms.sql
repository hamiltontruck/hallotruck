alter table public.orders add column if not exists payment_terms text;

update public.orders
set payment_terms = 'prepaid'
where payment_terms is null;

alter table public.orders
  alter column payment_terms set not null,
  alter column payment_terms set default 'pay_driver_on_delivery';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_terms_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_terms_check
      check (payment_terms in ('prepaid', 'pay_driver_on_delivery'));
  end if;
end;
$$;

create or replace function public.order_payment_ready_for_dispatch(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        o.payment_terms = 'pay_driver_on_delivery'
        or (
          coalesce(o.price_etb, 0) > 0
          and coalesce((
            select sum(
              case
                when p.event in ('held_escrow', 'released') then p.amount_etb
                when p.event = 'refunded' then -p.amount_etb
                else 0
              end
            )
            from public.payments p
            where p.order_id = o.id
          ), 0) + 0.005 >= coalesce(o.price_etb, 0)
        )
      )
  );
$$;

create or replace function public.driver_submit_collected_payment(
  p_order_id uuid,
  p_collection_method text,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_receipt_path text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  v_receipt_path text := btrim(coalesce(p_receipt_path, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payment_id uuid;
  v_existing_event public.payment_event;
  v_allowed_bank_providers constant text[] := array[
    'telebirr', 'cbe', 'awash_bank', 'bank_of_abyssinia',
    'dashen_bank', 'coop_bank_oromia', 'mpesa', 'other_bank'
  ];
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Approved driver account required';
  end if;

  select o.driver_id, o.status, coalesce(o.price_etb, 0), o.tracking_id, o.payment_terms
    into v_order_driver, v_order_status, v_order_total, v_tracking_id, v_payment_terms
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order_driver is distinct from v_driver_id then
    raise exception 'Only the assigned driver can report this payment';
  end if;

  if v_order_status <> 'delivered' then
    raise exception 'Payment collection can only be reported after delivery';
  end if;

  if v_order_total <= 0 then
    raise exception 'Order invoice total is invalid';
  end if;

  if p_amount_etb is null or abs(p_amount_etb - v_order_total) > 0.005 then
    raise exception 'Partial payment is not enabled. Report the full invoice amount of ETB %', v_order_total;
  end if;

  if v_method not in ('cash', 'bank') then
    raise exception 'Collection method must be cash or bank';
  end if;

  if v_method = 'cash' then
    v_provider := 'cash_to_driver';
    v_provider_ref := null;
  else
    if not (v_provider = any(v_allowed_bank_providers)) then
      raise exception 'Select a supported bank or mobile payment provider';
    end if;
    if v_provider_ref is null then
      raise exception 'Transaction ID is required for bank or mobile payment';
    end if;
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Collection note must be 500 characters or fewer';
  end if;

  if v_receipt_path = '' or split_part(v_receipt_path, '/', 1) <> v_driver_id::text then
    raise exception 'Invalid payment evidence path';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'payment-receipts' and so.name = v_receipt_path
  ) then
    raise exception 'Payment evidence upload was not found';
  end if;

  select p.id, p.event
    into v_payment_id, v_existing_event
  from public.payments p
  where p.order_id = p_order_id
    and p.event in ('initiated', 'held_escrow', 'released')
  order by p.created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    raise exception 'A payment is already submitted or verified for this order';
  end if;

  select p.id
    into v_payment_id
  from public.payments p
  where p.order_id = p_order_id
    and p.event = 'failed'
    and coalesce(p.raw_payload ->> 'source', '') = 'driver_collection'
  order by p.created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    update public.payments
    set provider = v_provider,
        provider_ref = v_provider_ref,
        amount_etb = v_order_total,
        event = 'initiated',
        receipt_path = v_receipt_path,
        raw_payload = jsonb_strip_nulls(jsonb_build_object(
          'source', 'driver_collection',
          'collection_method', v_method,
          'collected_by', v_driver_id,
          'direct_to_driver', true,
          'note', v_note,
          'tracking_id', v_tracking_id,
          'payment_terms', v_payment_terms
        ))
    where id = v_payment_id;
  else
    insert into public.payments (
      order_id, provider, provider_ref, amount_etb, event, receipt_path, raw_payload
    ) values (
      p_order_id,
      v_provider,
      v_provider_ref,
      v_order_total,
      'initiated',
      v_receipt_path,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'driver_collection',
        'collection_method', v_method,
        'collected_by', v_driver_id,
        'direct_to_driver', true,
        'note', v_note,
        'tracking_id', v_tracking_id,
        'payment_terms', v_payment_terms
      ))
    ) returning id into v_payment_id;
  end if;

  update public.orders
  set payment_provider = v_provider,
      payment_ref = v_provider_ref
  where id = p_order_id;

  return v_payment_id;
end;
$$;

create or replace function public.driver_unreported_deliveries()
returns table(
  order_id uuid,
  tracking_id text,
  pickup_address text,
  dropoff_address text,
  price_etb numeric,
  delivered_at timestamptz,
  rejection_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;

  return query
  select
    o.id,
    o.tracking_id,
    o.pickup_address,
    o.dropoff_address,
    coalesce(o.price_etb, 0),
    o.delivered_at,
    failed_driver.rejection_reason
  from public.orders o
  left join lateral (
    select p.rejection_reason
    from public.payments p
    where p.order_id = o.id
      and p.event = 'failed'
      and coalesce(p.raw_payload ->> 'source', '') = 'driver_collection'
    order by p.created_at desc
    limit 1
  ) failed_driver on true
  where o.driver_id = v_driver_id
    and o.status = 'delivered'
    and not exists (
      select 1 from public.payments active_payment
      where active_payment.order_id = o.id
        and active_payment.event in ('initiated', 'held_escrow', 'released')
    )
  order by o.delivered_at desc nulls last, o.created_at desc
  limit 10;
end;
$$;

notify pgrst, 'reload schema';
