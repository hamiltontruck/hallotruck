-- Restore the participant-scoped trip completion summary RPC used by the
-- Customer and Driver completion progress cards. This migration is read-only
-- with respect to order, payment, commission, proof and rating history.

create or replace function public.trip_completion_summary(p_order_id uuid)
returns table(
  order_id uuid,
  tracking_id text,
  order_status text,
  payment_terms text,
  invoice_total_etb numeric,
  initiated_etb numeric,
  held_escrow_etb numeric,
  released_etb numeric,
  refunded_etb numeric,
  verified_net_etb numeric,
  balance_due_etb numeric,
  commission_charged_etb numeric,
  payment_state text,
  delivery_proof_recorded boolean,
  rating_score smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_customer uuid;
  v_driver uuid;
  v_leadership boolean := false;
begin
  select trip_order.customer_id, trip_order.driver_id
  into v_customer, v_driver
  from public.orders trip_order
  where trip_order.id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  v_leadership := (select private.is_admin_or_ceo());
  if not v_leadership
    and v_actor is distinct from v_customer
    and v_actor is distinct from v_driver then
    raise exception 'You cannot view this trip completion summary';
  end if;

  return query
  with payment_totals as (
    select
      coalesce(sum(payment.amount_etb)
        filter (where payment.event = 'initiated'), 0)::numeric as initiated,
      coalesce(sum(payment.amount_etb)
        filter (where payment.event = 'held_escrow'), 0)::numeric as held,
      coalesce(sum(payment.amount_etb)
        filter (where payment.event = 'released'), 0)::numeric as released,
      coalesce(sum(payment.amount_etb)
        filter (where payment.event = 'refunded'), 0)::numeric as refunded
    from public.payments payment
    where payment.order_id = p_order_id
  ), latest_trip_result as (
    select result.result_type, result.commission_etb
    from public.driver_trip_payment_results result
    where result.order_id = p_order_id
    order by
      case when result.result_type in ('cash_received', 'bank_telebirr') then 0 else 1 end,
      result.created_at desc
    limit 1
  ), canonical_commission as (
    select confirmation.payment_id,
      case when confirmation.commission_reversed_at is null
        then round(confirmation.commission_etb, 2) else 0 end as original_commission
    from public.driver_payment_confirmations confirmation
    where confirmation.order_id = p_order_id

    union all

    select charge.payment_id,
      case when charge.status = 'active'
        then round(charge.commission_etb, 2) else 0 end as original_commission
    from public.driver_commission_charges charge
    where charge.order_id = p_order_id
      and not exists (
        select 1
        from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = charge.payment_id
      )
  ), effective_commission as (
    select canonical.payment_id,
      greatest(
        canonical.original_commission
          - coalesce(sum(correction.driver_commission_reversal_etb), 0),
        0
      ) as amount
    from canonical_commission canonical
    left join public.financial_corrections correction
      on correction.source_payment_id = canonical.payment_id
    group by canonical.payment_id, canonical.original_commission
  ), commission_total as (
    select coalesce(
      (select latest.commission_etb from latest_trip_result latest),
      (select sum(effective.amount) from effective_commission effective),
      0
    )::numeric as amount
  ), values_for_state as (
    select
      trip_order.id,
      trip_order.tracking_id,
      trip_order.status,
      trip_order.payment_terms,
      trip_order.price_etb,
      payment_totals.initiated,
      payment_totals.held,
      payment_totals.released,
      payment_totals.refunded,
      greatest(
        payment_totals.released + payment_totals.held - payment_totals.refunded,
        0
      )::numeric as verified_net,
      greatest(
        coalesce(trip_order.price_etb, 0)
          - greatest(
              payment_totals.released + payment_totals.held - payment_totals.refunded,
              0
            ),
        0
      )::numeric as balance_due
    from public.orders trip_order
    cross join payment_totals
    where trip_order.id = p_order_id
  )
  select
    state.id,
    state.tracking_id,
    state.status::text,
    state.payment_terms::text,
    coalesce(state.price_etb, 0)::numeric,
    state.initiated,
    state.held,
    state.released,
    state.refunded,
    state.verified_net,
    state.balance_due,
    case when v_leadership or v_actor = v_driver
      then commission_total.amount
      else 0
    end::numeric,
    case
      when state.status = 'cancelled' then 'cancelled'
      when state.status <> 'delivered' then 'delivery_pending'
      when exists (
        select 1 from latest_trip_result result
        where result.result_type = 'payment_not_received'
      ) then 'payment_required'
      when state.balance_due = 0 and state.released > state.refunded then 'released'
      when state.held > 0 then 'awaiting_driver_confirmation'
      when state.initiated > 0 then 'awaiting_admin_review'
      when state.balance_due > 0 then 'payment_required'
      when state.refunded > 0 then 'refunded'
      else 'payment_open'
    end,
    exists (
      select 1
      from public.delivery_proofs proof
      where proof.order_id = p_order_id
    ),
    (
      select max(rating.score)::smallint
      from public.ratings rating
      where rating.order_id = p_order_id
    )
  from values_for_state state
  cross join commission_total;
end;
$function$;

revoke all on function public.trip_completion_summary(uuid) from public, anon;
grant execute on function public.trip_completion_summary(uuid) to authenticated;

comment on function public.trip_completion_summary(uuid) is
  'Participant-scoped completion summary for Customer, assigned Driver and Admin/CEO. Reads immutable payment, commission, proof and rating history without modifying it.';

notify pgrst, 'reload schema';
