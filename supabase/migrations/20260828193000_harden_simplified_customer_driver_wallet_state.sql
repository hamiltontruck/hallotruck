-- Harden cumulative Driver deposit/commission snapshots for the simplified Customer–Driver workflow.
-- Partner Wallet, Partner commissions, Partner settlements, Partner earnings and Partner fleet finance are unchanged.

begin;

create or replace function private.driver_cash_wallet_state(p_driver_id uuid)
returns table(
  deposit_total_etb numeric,
  approved_paid_etb numeric,
  cash_liability_etb numeric,
  available_deposit_etb numeric,
  commission_due_etb numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with totals as (
    select
      coalesce((
        select sum(deposit.amount_etb)
        from public.driver_commission_deposits deposit
        where deposit.driver_id = p_driver_id
          and deposit.status = 'active'
      ), 0)::numeric as deposit_total,
      coalesce((
        select sum(payment.amount_etb)
        from public.driver_commission_payments payment
        where payment.driver_id = p_driver_id
          and payment.status = 'approved'
      ), 0)::numeric as approved_paid,
      private.driver_cash_commission_liability_total(p_driver_id)::numeric as cash_liability
  ), unpaid as (
    select
      deposit_total,
      approved_paid,
      cash_liability,
      greatest(0, cash_liability - least(cash_liability, approved_paid)) as unpaid_cash
    from totals
  )
  select
    deposit_total,
    approved_paid,
    cash_liability,
    greatest(0, deposit_total - unpaid_cash),
    greatest(0, unpaid_cash - deposit_total)
  from unpaid;
$function$;

revoke all on function private.driver_cash_wallet_state(uuid)
  from public, anon, authenticated;
grant execute on function private.driver_cash_wallet_state(uuid)
  to service_role;

create or replace function public.driver_record_trip_payment_result(
  p_order_id uuid,
  p_result_type text,
  p_amount_collected numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_driver uuid;
  v_status public.order_status;
  v_total numeric;
  v_method text;
  v_delivered_at timestamptz;
  v_payment uuid;
  v_payment_amount numeric;
  v_commission numeric := 0;
  v_available_before numeric := 0;
  v_available_after numeric := 0;
  v_consumed numeric := 0;
  v_due_before numeric := 0;
  v_due_after numeric := 0;
  v_verified_available numeric := 0;
  v_verified_due numeric := 0;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Driver sign-in required';
  end if;

  select
    trip_order.driver_id,
    trip_order.status,
    coalesce(trip_order.price_etb, 0),
    trip_order.selected_payment_method,
    trip_order.delivered_at
  into
    v_driver,
    v_status,
    v_total,
    v_method,
    v_delivered_at
  from public.orders trip_order
  where trip_order.id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_driver is distinct from v_actor then
    raise exception 'Only the database-assigned driver may report this trip';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor
      and profile.role::text = 'driver'
  ) then
    raise exception 'Driver role required';
  end if;
  if v_status <> 'delivered' or v_delivered_at is null then
    raise exception 'Finish the trip before reporting payment';
  end if;
  if p_result_type not in ('cash_received', 'bank_telebirr', 'payment_not_received') then
    raise exception 'Unsupported payment result';
  end if;
  if exists (
    select 1
    from public.driver_trip_payment_results result
    where result.order_id = p_order_id
      and result.result_type in ('cash_received', 'bank_telebirr')
  ) then
    raise exception 'Payment result already confirmed for this order';
  end if;

  select wallet.available_deposit_etb, wallet.commission_due_etb
  into v_available_before, v_due_before
  from private.driver_cash_wallet_state(v_driver) wallet;

  v_available_before := coalesce(v_available_before, 0);
  v_due_before := coalesce(v_due_before, 0);

  if p_result_type = 'payment_not_received' then
    if exists (
      select 1
      from public.driver_trip_payment_results result
      where result.order_id = p_order_id
        and result.result_type = 'payment_not_received'
    ) then
      raise exception 'Payment not received was already recorded';
    end if;

    insert into public.driver_trip_payment_results (
      order_id,
      assigned_driver_id,
      result_type,
      amount_collected,
      payment_method,
      completed_at,
      actor_id,
      note,
      deposit_before_etb,
      deposit_after_etb,
      commission_due_after_etb
    ) values (
      p_order_id,
      v_driver,
      'payment_not_received',
      0,
      'none',
      v_delivered_at,
      v_actor,
      nullif(btrim(coalesce(p_note, '')), ''),
      v_available_before,
      v_available_before,
      v_due_before
    )
    returning id into v_id;

    update public.orders
    set payment_status = 'unpaid'
    where id = p_order_id;

    insert into public.driver_commission_audit (
      driver_id,
      action,
      actor_id,
      details
    ) values (
      v_driver,
      'trip_completed_payment_outstanding',
      v_actor,
      jsonb_build_object(
        'order_id', p_order_id,
        'result_id', v_id,
        'completed_at', v_delivered_at,
        'payment_status', 'outstanding',
        'available_deposit_etb', v_available_before,
        'commission_due_etb', v_due_before
      )
    );

    return v_id;
  end if;

  if p_result_type = 'cash_received' then
    if v_method <> 'cash' then
      raise exception 'Customer selected Bank / Telebirr for this order';
    end if;
    if p_amount_collected is null or abs(p_amount_collected - v_total) > 0.005 then
      raise exception 'Exact collected amount must be ETB %', v_total;
    end if;

    insert into public.payments (
      order_id,
      provider,
      amount_etb,
      event,
      raw_payload
    ) values (
      p_order_id,
      'cash_to_driver',
      v_total,
      'released',
      jsonb_build_object(
        'source', 'driver_finish_trip',
        'collection_method', 'cash',
        'collected_by', v_actor,
        'collected_at', now()
      )
    )
    returning id into v_payment;

    v_commission := round(v_total * 0.02, 2);
    v_consumed := least(v_available_before, v_commission);
    v_available_after := greatest(0, v_available_before - v_commission);
    v_due_after := v_due_before + greatest(0, v_commission - v_available_before);

    select wallet.available_deposit_etb, wallet.commission_due_etb
    into v_verified_available, v_verified_due
    from private.driver_cash_wallet_state(v_driver) wallet;

    if abs(coalesce(v_verified_available, 0) - v_available_after) > 0.005
      or abs(coalesce(v_verified_due, 0) - v_due_after) > 0.005
    then
      raise exception 'Driver commission reconciliation failed';
    end if;

    insert into public.driver_trip_payment_results (
      order_id,
      assigned_driver_id,
      payment_id,
      result_type,
      amount_collected,
      payment_method,
      collected_at,
      completed_at,
      actor_id,
      note,
      commission_etb,
      driver_gross_etb,
      driver_net_etb,
      deposit_before_etb,
      deposit_consumed_etb,
      deposit_after_etb,
      commission_due_after_etb
    ) values (
      p_order_id,
      v_driver,
      v_payment,
      'cash_received',
      v_total,
      'cash',
      now(),
      v_delivered_at,
      v_actor,
      nullif(btrim(coalesce(p_note, '')), ''),
      v_commission,
      v_total,
      v_total - v_commission,
      v_available_before,
      v_consumed,
      v_available_after,
      v_due_after
    )
    returning id into v_id;

    insert into public.driver_commission_audit (
      driver_id,
      action,
      actor_id,
      details
    ) values (
      v_driver,
      'trip_completed_cash_received',
      v_actor,
      jsonb_build_object(
        'order_id', p_order_id,
        'payment_id', v_payment,
        'result_id', v_id,
        'gross_etb', v_total,
        'commission_etb', v_commission,
        'deposit_before_etb', v_available_before,
        'deposit_consumed_etb', v_consumed,
        'available_deposit_etb', v_available_after,
        'commission_due_etb', v_due_after
      )
    );

    perform public.recompute_order_payment_status(p_order_id);
    return v_id;
  end if;

  if v_method <> 'bank_telebirr' then
    raise exception 'Customer selected Cash for this order';
  end if;

  select payment.id, payment.amount_etb
  into v_payment, v_payment_amount
  from public.payments payment
  where payment.order_id = p_order_id
    and payment.event in ('initiated', 'held_escrow', 'released')
    and lower(replace(btrim(payment.provider), ' ', '_'))
      not in ('cash', 'cash_to_driver', 'driver_cash')
  order by payment.created_at desc
  limit 1
  for update;

  if v_payment is null then
    raise exception 'No HALLO Bank / Telebirr platform payment exists for this order';
  end if;
  if abs(coalesce(v_payment_amount, 0) - v_total) > 0.005 then
    raise exception 'Bank / Telebirr payment must equal the trip amount ETB %', v_total;
  end if;

  update public.payments
  set event = case
    when event = 'initiated' then 'held_escrow'::public.payment_event
    else event
  end
  where id = v_payment;

  v_commission := round(v_total * 0.02, 2);

  insert into public.driver_trip_payment_results (
    order_id,
    assigned_driver_id,
    payment_id,
    result_type,
    amount_collected,
    payment_method,
    collected_at,
    completed_at,
    actor_id,
    note,
    commission_etb,
    driver_gross_etb,
    driver_net_etb,
    deposit_before_etb,
    deposit_consumed_etb,
    deposit_after_etb,
    commission_due_after_etb
  ) values (
    p_order_id,
    v_driver,
    v_payment,
    'bank_telebirr',
    v_payment_amount,
    'bank_telebirr',
    now(),
    v_delivered_at,
    v_actor,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_commission,
    v_payment_amount,
    v_payment_amount - v_commission,
    v_available_before,
    0,
    v_available_before,
    v_due_before
  )
  returning id into v_id;

  insert into public.driver_payment_confirmation_events (
    order_id,
    assigned_driver_id,
    payment_id,
    confirmation_type,
    confirmed_amount_etb,
    provider,
    provider_ref,
    actor_id
  )
  select
    p_order_id,
    v_driver,
    payment.id,
    'payment_confirmed',
    payment.amount_etb,
    payment.provider,
    payment.provider_ref,
    v_actor
  from public.payments payment
  where payment.id = v_payment
  on conflict (payment_id, confirmation_type) do nothing;

  insert into public.driver_commission_audit (
    driver_id,
    action,
    actor_id,
    details
  ) values (
    v_driver,
    'trip_completed_bank_telebirr',
    v_actor,
    jsonb_build_object(
      'order_id', p_order_id,
      'payment_id', v_payment,
      'result_id', v_id,
      'gross_etb', v_payment_amount,
      'commission_etb', v_commission,
      'deposit_consumed_etb', 0,
      'available_deposit_etb', v_available_before,
      'commission_due_etb', v_due_before
    )
  );

  perform public.recompute_order_payment_status(p_order_id);
  return v_id;
exception
  when unique_violation then
    raise exception 'This trip payment result was already recorded';
end;
$function$;

revoke all on function public.driver_record_trip_payment_result(uuid, text, numeric, text)
  from public, anon;
grant execute on function public.driver_record_trip_payment_result(uuid, text, numeric, text)
  to authenticated;

create or replace function public.customer_submit_rating(
  p_order_id uuid,
  p_score smallint,
  p_comment text default null
)
returns public.ratings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer uuid := auth.uid();
  v_driver uuid;
  v_rating public.ratings;
begin
  if v_customer is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_customer
      and profile.role::text = 'customer'
  ) then
    raise exception 'Customer role required';
  end if;
  if p_score < 1 or p_score > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select trip_order.driver_id
  into v_driver
  from public.orders trip_order
  where trip_order.id = p_order_id
    and trip_order.customer_id = v_customer
    and trip_order.status = 'delivered'
    and trip_order.driver_id is not null;

  if v_driver is null then
    raise exception 'Only the owning customer may rate a completed order';
  end if;
  if exists (
    select 1
    from public.ratings rating
    where rating.order_id = p_order_id
  ) then
    raise exception 'This order was already rated';
  end if;

  insert into public.ratings (
    order_id,
    customer_id,
    driver_id,
    score,
    comment
  ) values (
    p_order_id,
    v_customer,
    v_driver,
    p_score,
    nullif(left(btrim(coalesce(p_comment, '')), 500), '')
  )
  returning * into v_rating;

  return v_rating;
end;
$function$;

revoke all on function public.customer_submit_rating(uuid, smallint, text)
  from public, anon;
grant execute on function public.customer_submit_rating(uuid, smallint, text)
  to authenticated;

create or replace function public.admin_customer_driver_reconciliation()
returns table(
  order_id uuid,
  tracking_id text,
  route text,
  customer_shipper text,
  assigned_driver text,
  trip_amount_etb numeric,
  payment_method text,
  cash_collected_etb numeric,
  bank_telebirr_received_etb numeric,
  hallo_commission_etb numeric,
  driver_gross_etb numeric,
  driver_net_etb numeric,
  deposit_consumed_etb numeric,
  remaining_available_deposit_etb numeric,
  commission_due_etb numeric,
  completed_at timestamptz,
  payment_status text,
  rating_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  return query
  with latest_result as (
    select distinct on (result.order_id) result.*
    from public.driver_trip_payment_results result
    order by
      result.order_id,
      case
        when result.result_type in ('cash_received', 'bank_telebirr') then 0
        else 1
      end,
      result.created_at desc
  )
  select
    trip_order.id,
    trip_order.tracking_id,
    trip_order.pickup_address || ' → ' || trip_order.dropoff_address,
    coalesce(nullif(trip_order.customer_name, ''), trip_order.customer_phone, 'Customer'),
    coalesce(nullif(driver.full_name, ''), driver.phone, 'Assigned driver'),
    coalesce(trip_order.price_etb, 0)::numeric,
    case
      when result.payment_method = 'none' then trip_order.selected_payment_method
      else result.payment_method
    end,
    case
      when result.result_type = 'cash_received' then result.amount_collected
      else 0
    end,
    case
      when result.result_type = 'bank_telebirr' then result.amount_collected
      else 0
    end,
    result.commission_etb,
    result.driver_gross_etb,
    result.driver_net_etb,
    result.deposit_consumed_etb,
    result.deposit_after_etb,
    result.commission_due_after_etb,
    result.completed_at,
    trip_order.payment_status::text,
    case when rating.id is null then 'not_rated' else 'rated' end
  from latest_result result
  join public.orders trip_order on trip_order.id = result.order_id
  left join public.profiles driver on driver.id = result.assigned_driver_id
  left join public.ratings rating on rating.order_id = result.order_id
  order by result.completed_at desc;
end;
$function$;

revoke all on function public.admin_customer_driver_reconciliation()
  from public, anon;
grant execute on function public.admin_customer_driver_reconciliation()
  to authenticated;

notify pgrst, 'reload schema';

commit;
