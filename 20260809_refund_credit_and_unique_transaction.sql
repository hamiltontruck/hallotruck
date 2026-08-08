create or replace function public.prevent_duplicate_payment_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider_ref is null or btrim(new.provider_ref) = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.payments p
    where lower(btrim(p.provider)) = lower(btrim(new.provider))
      and lower(btrim(coalesce(p.provider_ref, ''))) = lower(btrim(new.provider_ref))
  ) then
    raise exception 'Transaction ID already exists for this provider: %', new.provider_ref;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_unique_reference_guard on public.payments;
create trigger payments_unique_reference_guard
before insert on public.payments
for each row execute function public.prevent_duplicate_payment_reference();

create or replace function public.admin_refund_order_credit(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_total numeric;
  v_released_total numeric;
  v_credit_refunded numeric;
  v_credit numeric;
  v_ref text;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select coalesce(price_etb, 0)
    into v_order_total
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0)
  into v_released_total, v_credit_refunded
  from public.payments
  where order_id = p_order_id;

  v_credit := greatest(0, v_released_total - v_credit_refunded - v_order_total);

  if v_credit <= 0 then
    raise exception 'No overpayment credit is available to refund';
  end if;

  v_ref := 'REFUND-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.payments(order_id, provider, provider_ref, amount_etb, event)
  values (p_order_id, 'credit_refund', v_ref, v_credit, 'refunded');

  update public.orders
  set payment_status = case
    when v_released_total - (v_credit_refunded + v_credit) >= v_order_total and v_order_total > 0
      then 'released'::public.payment_status
    when v_released_total - (v_credit_refunded + v_credit) > 0
      then 'held_escrow'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = p_order_id;

  return v_credit;
end;
$$;

create or replace function public.admin_update_payment_event(
  p_payment_id uuid,
  p_event public.payment_event
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_current public.payment_event;
  v_amount numeric;
  v_order_total numeric;
  v_order_status public.order_status;
  v_released_total numeric;
  v_credit_refunded numeric;
  v_held_total numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select order_id, event, amount_etb
    into v_order_id, v_current, v_amount
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if not (
    (v_current = 'initiated' and p_event in ('held_escrow', 'failed')) or
    (v_current = 'held_escrow' and p_event in ('released', 'refunded')) or
    (v_current = 'released' and p_event = 'refunded') or
    v_current = p_event
  ) then
    raise exception 'Invalid payment transition: % to %', v_current, p_event;
  end if;

  select coalesce(price_etb, 0), status
    into v_order_total, v_order_status
  from public.orders
  where id = v_order_id
  for update;

  if p_event = 'released' and v_current <> 'released' then
    if v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;

    select
      coalesce(sum(amount_etb) filter (where event = 'released'), 0),
      coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0)
    into v_released_total, v_credit_refunded
    from public.payments
    where order_id = v_order_id;

    if v_released_total - v_credit_refunded + v_amount > v_order_total then
      raise exception 'Release exceeds invoice total by ETB %',
        (v_released_total - v_credit_refunded + v_amount - v_order_total);
    end if;
  end if;

  update public.payments
  set event = p_event
  where id = p_payment_id;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0)
  into v_released_total, v_credit_refunded, v_held_total
  from public.payments
  where order_id = v_order_id;

  update public.orders
  set payment_status = case
    when v_released_total - v_credit_refunded >= v_order_total and v_order_total > 0 then 'released'::public.payment_status
    when v_released_total - v_credit_refunded > 0 or v_held_total > 0 then 'held_escrow'::public.payment_status
    when exists (
      select 1 from public.payments
      where order_id = v_order_id and event = 'refunded'
    ) then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = v_order_id;
end;
$$;

create or replace function public.admin_record_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_event public.payment_event
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_released_total numeric;
  v_credit_refunded numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  if p_amount_etb <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select id
    into v_payment_id
  from public.payments
  where order_id = p_order_id
    and lower(provider) = lower(btrim(p_provider))
    and coalesce(provider_ref, '') = coalesce(nullif(btrim(p_provider_ref), ''), '')
    and amount_etb = p_amount_etb
    and event in ('initiated', 'held_escrow')
  order by created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    perform public.admin_update_payment_event(v_payment_id, p_event);
    return;
  end if;

  if nullif(btrim(p_provider_ref), '') is not null and exists (
    select 1 from public.payments
    where lower(btrim(provider)) = lower(btrim(p_provider))
      and lower(btrim(coalesce(provider_ref, ''))) = lower(btrim(p_provider_ref))
  ) then
    raise exception 'Transaction ID already exists for this provider: %', btrim(p_provider_ref);
  end if;

  if p_event = 'released' then
    select coalesce(price_etb, 0), status
      into v_order_total, v_order_status
    from public.orders
    where id = p_order_id
    for update;

    if not found then
      raise exception 'Order not found';
    end if;

    if v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;

    select
      coalesce(sum(amount_etb) filter (where event = 'released'), 0),
      coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0)
    into v_released_total, v_credit_refunded
    from public.payments
    where order_id = p_order_id;

    if v_released_total - v_credit_refunded + p_amount_etb > v_order_total then
      raise exception 'Release exceeds invoice total by ETB %',
        (v_released_total - v_credit_refunded + p_amount_etb - v_order_total);
    end if;
  end if;

  insert into public.payments(order_id, provider, provider_ref, amount_etb, event)
  values (
    p_order_id,
    btrim(p_provider),
    nullif(btrim(p_provider_ref), ''),
    p_amount_etb,
    p_event
  );

  if p_event in ('held_escrow', 'released', 'refunded') then
    update public.orders
    set payment_provider = btrim(p_provider),
        payment_ref = nullif(btrim(p_provider_ref), ''),
        payment_status = case p_event
          when 'held_escrow' then 'held_escrow'::public.payment_status
          when 'released' then 'released'::public.payment_status
          when 'refunded' then 'refunded'::public.payment_status
          else payment_status
        end
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.admin_refund_order_credit(uuid) from public, anon;
grant execute on function public.admin_refund_order_credit(uuid) to authenticated;
revoke all on function public.admin_update_payment_event(uuid, public.payment_event) from public, anon;
revoke all on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) from public, anon;
grant execute on function public.admin_update_payment_event(uuid, public.payment_event) to authenticated;
grant execute on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) to authenticated;

notify pgrst, 'reload schema';