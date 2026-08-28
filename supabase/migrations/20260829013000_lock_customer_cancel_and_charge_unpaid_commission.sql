-- Lock Customer cancellation after assignment and charge HALLO's 2% commission
-- for every completed Driver outcome, including payment not received.
-- Partner Wallet, Partner commission, Partner settlement and Partner fleet finance are unchanged.

begin;

create or replace function public.customer_cancel_order(
  p_order_id uuid,
  p_reason text
)
returns table(
  order_id uuid,
  status public.order_status,
  cancellation_reason text,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_customer_id uuid;
  v_driver_id uuid;
  v_status public.order_status;
  v_reason text := nullif(btrim(p_reason), '');
  v_cancelled_at timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Customer sign-in is required';
  end if;

  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Write a cancellation reason of at least 5 characters';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'Cancellation reason must be 500 characters or fewer';
  end if;

  select trip_order.customer_id, trip_order.driver_id, trip_order.status
    into v_customer_id, v_driver_id, v_status
  from public.orders trip_order
  where trip_order.id = p_order_id
  for update;

  if not found or v_customer_id is distinct from v_actor then
    raise exception 'Order not found in your customer account';
  end if;

  if v_status = 'cancelled'::public.order_status then
    raise exception 'This order is already cancelled';
  end if;

  if v_driver_id is not null
    or v_status not in ('quoted'::public.order_status, 'placed'::public.order_status)
  then
    raise exception 'This order cannot be cancelled after a Driver is assigned or the trip has started';
  end if;

  update public.orders trip_order
  set status = 'cancelled'::public.order_status,
      cancellation_reason = v_reason,
      cancelled_at = v_cancelled_at,
      cancelled_by = v_actor,
      cancellation_source = 'customer'
  where trip_order.id = p_order_id;

  update public.customer_dispatch_requests request
  set status = 'cancelled',
      updated_at = v_cancelled_at
  where request.order_id = p_order_id
    and request.status in ('requested', 'approved');

  return query
  select
    p_order_id,
    'cancelled'::public.order_status,
    v_reason,
    v_cancelled_at;
end;
$function$;

revoke all on function public.customer_cancel_order(uuid, text) from public, anon;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;

comment on function public.customer_cancel_order(uuid, text) is
  'Cancels only a Customer-owned unassigned quoted/placed order. Assignment, acceptance and trip start permanently lock Customer cancellation.';

create or replace function private.driver_cash_commission_liability_total(p_driver_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $function$
  with cash_payment_liability as (
    select coalesce(sum(charge.commission_etb), 0)::numeric as amount
    from public.driver_commission_charges charge
    join public.payments payment on payment.id = charge.payment_id
    where charge.driver_id = p_driver_id
      and charge.status = 'active'
      and lower(replace(btrim(coalesce(payment.provider, '')), ' ', '_'))
        in ('cash', 'cash_to_driver', 'driver_cash')
  ), unpaid_trip_liability as (
    select coalesce(sum(result.commission_etb), 0)::numeric as amount
    from public.driver_trip_payment_results result
    where result.assigned_driver_id = p_driver_id
      and result.result_type = 'payment_not_received'
      and not exists (
        select 1
        from public.driver_trip_payment_results positive_result
        where positive_result.order_id = result.order_id
          and positive_result.result_type in ('cash_received', 'bank_telebirr')
      )
  )
  select cash_payment_liability.amount + unpaid_trip_liability.amount
  from cash_payment_liability cross join unpaid_trip_liability;
$function$;

revoke all on function private.driver_cash_commission_liability_total(uuid)
  from public, anon, authenticated;
grant execute on function private.driver_cash_commission_liability_total(uuid)
  to service_role;

create or replace function private.driver_commission_charged_total(
  p_driver_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $function$
  with canonical as (
    select
      confirmation.payment_id,
      case when confirmation.commission_reversed_at is null
        then round(confirmation.commission_etb, 2) else 0 end as original_commission
    from public.driver_payment_confirmations confirmation
    where confirmation.driver_id = p_driver_id

    union all

    select
      charge.payment_id,
      case when charge.status = 'active'
        then round(charge.commission_etb, 2) else 0 end as original_commission
    from public.driver_commission_charges charge
    where charge.driver_id = p_driver_id
      and not exists (
        select 1
        from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = charge.payment_id
      )
  ), corrected as (
    select
      canonical.payment_id,
      greatest(
        canonical.original_commission - coalesce(sum(correction.driver_commission_reversal_etb), 0),
        0
      ) as effective_commission
    from canonical
    left join public.financial_corrections correction
      on correction.source_payment_id = canonical.payment_id
    group by canonical.payment_id, canonical.original_commission
  ), unpaid_trip_commission as (
    select coalesce(sum(result.commission_etb), 0)::numeric as amount
    from public.driver_trip_payment_results result
    where result.assigned_driver_id = p_driver_id
      and result.result_type = 'payment_not_received'
      and not exists (
        select 1
        from public.driver_trip_payment_results positive_result
        where positive_result.order_id = result.order_id
          and positive_result.result_type in ('cash_received', 'bank_telebirr')
      )
  )
  select
    coalesce((select sum(corrected.effective_commission) from corrected), 0)::numeric
    + unpaid_trip_commission.amount
  from unpaid_trip_commission;
$function$;

revoke all on function private.driver_commission_charged_total(uuid)
  from public, anon, authenticated;

create or replace function private.prepare_unpaid_trip_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_driver uuid;
  v_trip_amount numeric;
  v_commission numeric;
  v_available_before numeric := 0;
  v_due_before numeric := 0;
begin
  if new.result_type <> 'payment_not_received' then
    return new;
  end if;

  select trip_order.driver_id, coalesce(trip_order.price_etb, 0)
    into v_order_driver, v_trip_amount
  from public.orders trip_order
  where trip_order.id = new.order_id;

  if v_order_driver is null or v_order_driver is distinct from new.assigned_driver_id then
    raise exception 'Unpaid commission requires the database-assigned Driver';
  end if;

  if v_trip_amount <= 0 then
    raise exception 'Completed trip amount must be greater than zero';
  end if;

  select wallet.available_deposit_etb, wallet.commission_due_etb
    into v_available_before, v_due_before
  from private.driver_cash_wallet_state(new.assigned_driver_id) wallet;

  v_available_before := coalesce(v_available_before, 0);
  v_due_before := coalesce(v_due_before, 0);
  v_commission := round(v_trip_amount * 0.02, 2);

  new.commission_etb := v_commission;
  new.driver_gross_etb := v_trip_amount;
  new.driver_net_etb := v_trip_amount - v_commission;
  new.deposit_before_etb := v_available_before;
  new.deposit_consumed_etb := least(v_available_before, v_commission);
  new.deposit_after_etb := greatest(0, v_available_before - v_commission);
  new.commission_due_after_etb := v_due_before + greatest(0, v_commission - v_available_before);

  return new;
end;
$function$;

revoke all on function private.prepare_unpaid_trip_commission()
  from public, anon, authenticated;

drop trigger if exists prepare_unpaid_trip_commission
  on public.driver_trip_payment_results;
create trigger prepare_unpaid_trip_commission
before insert on public.driver_trip_payment_results
for each row execute function private.prepare_unpaid_trip_commission();

create or replace function private.audit_unpaid_trip_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.result_type = 'payment_not_received' then
    insert into public.driver_commission_audit (
      driver_id,
      action,
      actor_id,
      details
    ) values (
      new.assigned_driver_id,
      'trip_completed_unpaid_commission_accrued',
      new.actor_id,
      jsonb_build_object(
        'order_id', new.order_id,
        'result_id', new.id,
        'gross_etb', new.driver_gross_etb,
        'commission_rate', 0.02,
        'commission_etb', new.commission_etb,
        'deposit_before_etb', new.deposit_before_etb,
        'deposit_consumed_etb', new.deposit_consumed_etb,
        'available_deposit_etb', new.deposit_after_etb,
        'commission_due_etb', new.commission_due_after_etb,
        'payment_status', 'outstanding'
      )
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.audit_unpaid_trip_commission()
  from public, anon, authenticated;

drop trigger if exists audit_unpaid_trip_commission
  on public.driver_trip_payment_results;
create trigger audit_unpaid_trip_commission
after insert on public.driver_trip_payment_results
for each row execute function private.audit_unpaid_trip_commission();

notify pgrst, 'reload schema';

commit;
