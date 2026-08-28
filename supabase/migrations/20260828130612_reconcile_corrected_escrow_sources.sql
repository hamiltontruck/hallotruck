-- Reconcile immutable financial corrections against their exact payment
-- source. A corrected Held Escrow payment may only release its remaining
-- effective value, and driver commission accrues on that value exactly once.

create or replace function private.effective_payment_amount(p_payment_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    round(payment.amount_etb - coalesce(sum(correction.amount_etb), 0), 2),
    0
  )::numeric
  from public.payments payment
  left join public.financial_corrections correction
    on correction.source_payment_id = payment.id
  where payment.id = p_payment_id
  group by payment.id, payment.amount_etb;
$$;

revoke all on function private.effective_payment_amount(uuid)
  from public, anon, authenticated;

create or replace function public.recompute_order_payment_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total numeric;
  v_released numeric;
  v_held numeric;
  v_unlinked_refunded numeric;
  v_effective_released numeric;
  v_effective_held numeric;
  v_has_refund boolean;
begin
  select coalesce(price_etb, 0)
    into v_total
  from public.orders
  where id = p_order_id
  for update;

  if not found then return; end if;

  with corrected_sources as (
    select
      payment.id,
      payment.event,
      greatest(
        round(payment.amount_etb - coalesce(sum(correction.amount_etb), 0), 2),
        0
      ) as effective_amount
    from public.payments payment
    left join public.financial_corrections correction
      on correction.source_payment_id = payment.id
    where payment.order_id = p_order_id
      and payment.event in ('held_escrow', 'released')
    group by payment.id, payment.event, payment.amount_etb
  )
  select
    coalesce(sum(source.effective_amount)
      filter (where source.event = 'released'), 0),
    coalesce(sum(source.effective_amount)
      filter (where source.event = 'held_escrow'), 0)
  into v_released, v_held
  from corrected_sources source;

  -- Old refund rows may predate financial_corrections. Preserve their global
  -- effect, but do not subtract correction-backed refund rows a second time.
  select
    coalesce(sum(payment.amount_etb), 0),
    exists (
      select 1
      from public.payments refund
      where refund.order_id = p_order_id
        and refund.event = 'refunded'
    )
  into v_unlinked_refunded, v_has_refund
  from public.payments payment
  where payment.order_id = p_order_id
    and payment.event = 'refunded'
    and not exists (
      select 1
      from public.financial_corrections correction
      where correction.refund_payment_id = payment.id
    );

  v_effective_released := greatest(v_released - v_unlinked_refunded, 0);
  v_effective_held := greatest(
    v_held - greatest(v_unlinked_refunded - v_released, 0),
    0
  );

  update public.orders
  set payment_status = case
    when v_total > 0 and v_effective_released >= v_total
      then 'released'::public.payment_status
    when v_effective_held > 0 or v_effective_released > 0
      then 'held_escrow'::public.payment_status
    when v_has_refund then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = p_order_id;
end;
$function$;

revoke all on function public.recompute_order_payment_status(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_order_payment_status(uuid)
  to service_role;

drop function if exists public.driver_payment_status(uuid);
create function public.driver_payment_status(p_order_id uuid)
returns table (
  payment_id uuid,
  provider text,
  provider_ref text,
  amount_etb numeric,
  payment_event text,
  confirmation_type text,
  confirmation_reason text,
  confirmed_at timestamptz,
  released_at timestamptz,
  order_status text,
  can_confirm boolean,
  can_report_not_received boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;
  if not exists (
    select 1
    from public.orders driver_order
    join public.profiles driver_profile on driver_profile.id = driver_order.driver_id
    where driver_order.id = p_order_id
      and driver_order.driver_id = v_driver_id
      and driver_profile.role::text = 'driver'
  ) then
    raise exception 'This order is not assigned to the signed-in driver';
  end if;

  return query
  select
    payment.id,
    payment.provider,
    payment.provider_ref,
    private.effective_payment_amount(payment.id),
    payment.event::text,
    latest_event.confirmation_type,
    latest_event.reason,
    positive_event.confirmed_at,
    confirmation.released_at,
    driver_order.status::text,
    (
      driver_order.status = 'delivered'
      and payment.event = 'held_escrow'
      and private.effective_payment_amount(payment.id) > 0
      and positive_event.id is null
    ),
    (
      driver_order.status = 'delivered'
      and payment.event = 'held_escrow'
      and private.effective_payment_amount(payment.id) > 0
      and positive_event.id is null
      and negative_event.id is null
    )
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  left join public.driver_payment_confirmations confirmation
    on confirmation.payment_id = payment.id
  left join lateral (
    select event.id, event.confirmation_type, event.reason, event.confirmed_at
    from public.driver_payment_confirmation_events event
    where event.payment_id = payment.id
    order by event.confirmed_at desc, event.id desc
    limit 1
  ) latest_event on true
  left join lateral (
    select event.id, event.confirmed_at
    from public.driver_payment_confirmation_events event
    where event.payment_id = payment.id
      and event.confirmation_type = 'payment_confirmed'
    order by event.confirmed_at desc
    limit 1
  ) positive_event on true
  left join lateral (
    select event.id
    from public.driver_payment_confirmation_events event
    where event.payment_id = payment.id
      and event.confirmation_type = 'payment_not_received'
    order by event.confirmed_at desc
    limit 1
  ) negative_event on true
  where payment.order_id = p_order_id
    and payment.event in ('initiated', 'held_escrow', 'released')
    and private.effective_payment_amount(payment.id) > 0
  order by payment.created_at desc;
end;
$function$;

revoke all on function public.driver_payment_status(uuid) from public, anon;
grant execute on function public.driver_payment_status(uuid) to authenticated;

create or replace function public.driver_confirm_verified_payment(p_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_assigned_driver uuid;
  v_event public.payment_event;
  v_provider text;
  v_provider_ref text;
  v_effective_amount numeric;
  v_order_status public.order_status;
begin
  if v_actor is null then raise exception 'Driver sign-in required'; end if;

  select
    payment.order_id,
    driver_order.driver_id,
    payment.event,
    payment.provider,
    payment.provider_ref,
    private.effective_payment_amount(payment.id),
    driver_order.status
  into
    v_order_id,
    v_assigned_driver,
    v_event,
    v_provider,
    v_provider_ref,
    v_effective_amount,
    v_order_status
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if v_assigned_driver is distinct from v_actor then
    raise exception 'Only the database-assigned driver can confirm this payment';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor and profile.role::text = 'driver'
  ) then
    raise exception 'Driver role required';
  end if;
  if v_order_status <> 'delivered' then
    raise exception 'Finish the trip before confirming payment';
  end if;
  if v_event <> 'held_escrow' then
    raise exception 'Only a Held Escrow payment can be confirmed';
  end if;
  if coalesce(v_effective_amount, 0) <= 0 then
    raise exception 'Corrected payment has no remaining value to confirm';
  end if;
  if lower(btrim(coalesce(v_provider, ''))) in (
    'cash', 'cash_to_driver', 'driver_cash'
  ) then
    raise exception 'Cash received by the driver must use the cash collection workflow';
  end if;
  if exists (
    select 1
    from public.driver_payment_confirmation_events event
    where event.payment_id = p_payment_id
      and event.confirmation_type = 'payment_confirmed'
  ) then
    raise exception 'This payment was already confirmed by the assigned driver';
  end if;

  begin
    insert into public.driver_payment_confirmation_events (
      order_id, assigned_driver_id, payment_id, confirmation_type,
      confirmed_amount_etb, provider, provider_ref, actor_id
    ) values (
      v_order_id, v_assigned_driver, p_payment_id, 'payment_confirmed',
      round(v_effective_amount, 2), v_provider, v_provider_ref, v_actor
    );
  exception when unique_violation then
    raise exception 'This payment was already confirmed by the assigned driver';
  end;

  return 'confirmed_waiting_admin_release';
end;
$function$;

revoke all on function public.driver_confirm_verified_payment(uuid)
  from public, anon;
grant execute on function public.driver_confirm_verified_payment(uuid)
  to authenticated;

create or replace function public.populate_driver_payment_confirmation_financials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_amount numeric;
  v_provider text;
begin
  select private.effective_payment_amount(payment.id), payment.provider
    into v_amount, v_provider
  from public.payments payment
  where payment.id = new.payment_id;

  if not found then
    raise exception 'Payment not found for driver confirmation';
  end if;
  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Corrected payment has no releasable value';
  end if;
  if lower(btrim(coalesce(v_provider, ''))) in (
    'cash', 'cash_to_driver', 'driver_cash'
  ) then
    raise exception 'Cash paid to a driver belongs to the driver commission wallet flow';
  end if;

  new.gross_etb := round(v_amount, 2);
  new.commission_percent := 2.00;
  new.commission_etb := round(v_amount * 0.02, 2);
  new.driver_net_etb := round(v_amount - (v_amount * 0.02), 2);
  new.commission_accrued_at := coalesce(
    new.commission_accrued_at,
    new.confirmed_at,
    now()
  );
  return new;
end;
$function$;

revoke all on function public.populate_driver_payment_confirmation_financials()
  from public, anon, authenticated;
grant execute on function public.populate_driver_payment_confirmation_financials()
  to service_role;

create or replace function public.release_confirmed_driver_payment_internal(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_driver_id uuid;
  v_event public.payment_event;
  v_effective_amount numeric;
  v_provider text;
  v_order_status public.order_status;
  v_order_total numeric;
  v_effective_released numeric;
  v_unlinked_refunded numeric;
begin
  select
    payment.order_id,
    driver_order.driver_id,
    payment.event,
    private.effective_payment_amount(payment.id),
    payment.provider,
    driver_order.status,
    coalesce(driver_order.price_etb, 0)
  into
    v_order_id,
    v_driver_id,
    v_event,
    v_effective_amount,
    v_provider,
    v_order_status,
    v_order_total
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then return false; end if;
  if v_event = 'released' then return true; end if;
  if v_event <> 'held_escrow' or v_order_status <> 'delivered' then return false; end if;
  if coalesce(v_effective_amount, 0) <= 0 then return false; end if;
  if lower(btrim(coalesce(v_provider, ''))) in (
    'cash', 'cash_to_driver', 'driver_cash'
  ) then return false; end if;
  if not exists (
    select 1
    from public.driver_payment_confirmation_events event
    where event.payment_id = p_payment_id
      and event.order_id = v_order_id
      and event.assigned_driver_id = v_driver_id
      and event.actor_id = v_driver_id
      and event.confirmation_type = 'payment_confirmed'
  ) then return false; end if;

  select coalesce(sum(private.effective_payment_amount(payment.id)), 0)
    into v_effective_released
  from public.payments payment
  where payment.order_id = v_order_id
    and payment.event = 'released';

  select coalesce(sum(payment.amount_etb), 0)
    into v_unlinked_refunded
  from public.payments payment
  where payment.order_id = v_order_id
    and payment.event = 'refunded'
    and not exists (
      select 1
      from public.financial_corrections correction
      where correction.refund_payment_id = payment.id
    );

  v_effective_released := greatest(
    v_effective_released - v_unlinked_refunded,
    0
  );
  if v_effective_released + v_effective_amount > v_order_total + 0.005 then
    return false;
  end if;

  insert into public.driver_payment_confirmations(
    payment_id, order_id, driver_id, confirmed_at
  )
  select
    p_payment_id,
    v_order_id,
    v_driver_id,
    confirmation.confirmed_at
  from public.driver_payment_confirmation_events confirmation
  where confirmation.payment_id = p_payment_id
    and confirmation.confirmation_type = 'payment_confirmed'
  order by confirmation.confirmed_at
  limit 1
  on conflict (payment_id) do nothing;

  update public.payments
  set event = 'released'
  where id = p_payment_id and event = 'held_escrow';
  if not found then return false; end if;

  update public.driver_payment_confirmations
  set released_at = coalesce(released_at, now())
  where payment_id = p_payment_id;

  perform public.recompute_order_payment_status(v_order_id);
  return true;
end;
$function$;

revoke all on function public.release_confirmed_driver_payment_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.release_confirmed_driver_payment_internal(uuid)
  to service_role;

create or replace function public.admin_update_payment_event(
  p_payment_id uuid,
  p_event public.payment_event
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_current public.payment_event;
  v_effective_amount numeric;
  v_provider text;
  v_driver_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_committed_excluding_current numeric;
  v_unlinked_refunded numeric;
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_event = 'refunded' then
    raise exception 'Use the auditable financial correction action for refunds';
  end if;

  select
    payment.order_id,
    payment.event,
    private.effective_payment_amount(payment.id),
    payment.provider,
    driver_order.driver_id,
    coalesce(driver_order.price_etb, 0),
    driver_order.status
  into
    v_order_id,
    v_current,
    v_effective_amount,
    v_provider,
    v_driver_id,
    v_order_total,
    v_order_status
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if not (
    (v_current = 'initiated' and p_event in ('held_escrow', 'failed'))
    or (v_current = 'held_escrow' and p_event = 'released')
    or v_current = p_event
  ) then
    raise exception 'Invalid payment transition: % to %', v_current, p_event;
  end if;

  if p_event in ('held_escrow', 'released')
    and v_current is distinct from p_event then
    if coalesce(v_effective_amount, 0) <= 0 then
      raise exception 'Corrected payment has no releasable value';
    end if;
    if p_event = 'released' and v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;
    if p_event = 'released'
      and lower(btrim(coalesce(v_provider, ''))) not in (
        'cash', 'cash_to_driver', 'driver_cash'
      )
      and not exists (
        select 1
        from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = p_payment_id
          and confirmation.order_id = v_order_id
          and confirmation.driver_id = v_driver_id
      ) then
      raise exception 'Assigned driver confirmation is required before releasing this payment';
    end if;

    select coalesce(sum(private.effective_payment_amount(payment.id)), 0)
      into v_committed_excluding_current
    from public.payments payment
    where payment.order_id = v_order_id
      and payment.id <> p_payment_id
      and payment.event in ('held_escrow', 'released');

    select coalesce(sum(payment.amount_etb), 0)
      into v_unlinked_refunded
    from public.payments payment
    where payment.order_id = v_order_id
      and payment.event = 'refunded'
      and not exists (
        select 1
        from public.financial_corrections correction
        where correction.refund_payment_id = payment.id
      );

    v_committed_excluding_current := greatest(
      v_committed_excluding_current - v_unlinked_refunded,
      0
    );
    if v_committed_excluding_current + v_effective_amount
      > v_order_total + 0.005 then
      raise exception 'Payment transition exceeds invoice total by ETB %',
        round(
          v_committed_excluding_current + v_effective_amount - v_order_total,
          2
        );
    end if;
  end if;

  update public.payments set event = p_event where id = p_payment_id;
  if p_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
  end if;
  perform public.recompute_order_payment_status(v_order_id);
end;
$function$;

revoke all on function public.admin_update_payment_event(
  uuid, public.payment_event
) from public, anon;
grant execute on function public.admin_update_payment_event(
  uuid, public.payment_event
) to authenticated;

notify pgrst, 'reload schema';
