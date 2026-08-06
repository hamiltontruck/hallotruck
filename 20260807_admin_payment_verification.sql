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
  v_order_total numeric;
  v_released_total numeric;
  v_held_total numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select order_id, event
    into v_order_id, v_current
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

  update public.payments
  set event = p_event
  where id = p_payment_id;

  select coalesce(price_etb, 0)
    into v_order_total
  from public.orders
  where id = v_order_id
  for update;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0)
  into v_released_total, v_held_total
  from public.payments
  where order_id = v_order_id;

  update public.orders
  set payment_status = case
    when v_released_total >= v_order_total and v_order_total > 0 then 'released'::public.payment_status
    when v_released_total > 0 or v_held_total > 0 then 'held_escrow'::public.payment_status
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

revoke all on function public.admin_update_payment_event(uuid, public.payment_event) from public, anon;
revoke all on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) from public, anon;
grant execute on function public.admin_update_payment_event(uuid, public.payment_event) to authenticated;
grant execute on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) to authenticated;

notify pgrst, 'reload schema';
