-- Customer/Driver trip-completion orchestration.
--
-- This migration does not add or mutate financial history. It exposes a
-- participant-scoped, correction-aware summary over the existing immutable
-- payment and commission ledgers, makes POD retries idempotent, and finishes
-- the move from stale JWT metadata to database-backed leadership roles.

alter policy "delivery proofs participants read"
on public.delivery_proofs
using (
  (select private.is_admin_or_ceo())
  or exists (
    select 1
    from public.orders trip_order
    where trip_order.id = delivery_proofs.order_id
      and (trip_order.driver_id = (select auth.uid())
        or trip_order.customer_id = (select auth.uid()))
  )
);

alter policy "delivery proof upload"
on storage.objects
with check (
  bucket_id = 'delivery-proofs'
  and exists (
    select 1
    from public.orders trip_order
    where trip_order.id::text = (storage.foldername(name))[1]
      and trip_order.status = 'in_transit'
      and ((select private.is_admin_or_ceo())
        or trip_order.driver_id = (select auth.uid()))
  )
);

alter policy "delivery proof read"
on storage.objects
using (
  bucket_id = 'delivery-proofs'
  and exists (
    select 1
    from public.delivery_proofs proof
    join public.orders trip_order on trip_order.id = proof.order_id
    where name in (proof.photo_path, proof.signature_path)
      and ((select private.is_admin_or_ceo())
        or trip_order.driver_id = (select auth.uid())
        or trip_order.customer_id = (select auth.uid()))
  )
);

alter policy "delivery proof cleanup"
on storage.objects
using (
  bucket_id = 'delivery-proofs'
  and exists (
    select 1
    from public.orders trip_order
    where trip_order.id::text = (storage.foldername(name))[1]
      and (
        (select private.is_admin_or_ceo())
        or (
          trip_order.driver_id = (select auth.uid())
          and not exists (
            select 1 from public.delivery_proofs recorded_proof
            where name in (recorded_proof.photo_path, recorded_proof.signature_path)
          )
        )
      )
  )
);

alter policy "payments: participants read"
on public.payments
using (
  exists (
    select 1 from public.orders trip_order
    where trip_order.id = payments.order_id
      and trip_order.customer_id = (select auth.uid())
  )
  or exists (
    select 1 from public.orders trip_order
    where trip_order.id = payments.order_id
      and trip_order.driver_id = (select auth.uid())
      and payments.event in ('held_escrow', 'released', 'refunded')
  )
  or (select private.is_admin_or_ceo())
);

alter policy "ratings participants read"
on public.ratings
using (
  customer_id = (select auth.uid())
  or driver_id = (select auth.uid())
  or (select private.is_admin_or_ceo())
);

alter policy "orders admin manage"
on public.orders
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

alter policy "payments admin manage"
on public.payments
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

create or replace function public.submit_delivery_proof(
  p_order_id uuid,
  p_recipient_name text,
  p_delivery_note text,
  p_photo_path text,
  p_signature_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_driver uuid;
  v_truck uuid;
  v_status public.order_status;
  v_existing_proof boolean;
begin
  if v_actor is null then
    raise exception 'Sign in required';
  end if;

  select trip_order.driver_id, trip_order.truck_id, trip_order.status
  into v_driver, v_truck, v_status
  from public.orders trip_order
  where trip_order.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not (select private.is_admin_or_ceo())
    and v_driver is distinct from v_actor then
    raise exception 'Not authorized for this order';
  end if;

  select exists (
    select 1 from public.delivery_proofs proof
    where proof.order_id = p_order_id
  ) into v_existing_proof;

  -- A client can lose the success response after the transaction committed.
  -- Treat the same participant's retry as success without replacing history.
  if v_status = 'delivered' and v_existing_proof then
    return;
  end if;

  if v_status <> 'in_transit' then
    raise exception 'Order must be in transit';
  end if;

  if p_photo_path not like p_order_id::text || '/%'
    or p_signature_path not like p_order_id::text || '/%' then
    raise exception 'Invalid proof path';
  end if;

  if not exists (
      select 1 from storage.objects
      where bucket_id = 'delivery-proofs' and name = p_photo_path
    ) or not exists (
      select 1 from storage.objects
      where bucket_id = 'delivery-proofs' and name = p_signature_path
    ) then
    raise exception 'Proof files are missing';
  end if;

  insert into public.delivery_proofs(
    order_id, recipient_name, delivery_note, photo_path,
    signature_path, delivered_by
  ) values (
    p_order_id,
    btrim(p_recipient_name),
    nullif(btrim(p_delivery_note), ''),
    p_photo_path,
    p_signature_path,
    v_actor
  );

  update public.orders
  set status = 'delivered', delivered_at = now()
  where id = p_order_id;

  if v_truck is not null then
    update public.trucks
    set status = 'available', driver_id = null, updated_at = now()
    where id = v_truck;
  end if;
end;
$$;

revoke all on function public.submit_delivery_proof(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.submit_delivery_proof(uuid, text, text, text, text)
  to authenticated;

create or replace function public.admin_review_customer_payment(
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
  v_actor uuid := auth.uid();
  v_event public.payment_event;
  v_order_id uuid;
  v_order_status public.order_status;
  v_order_total numeric;
  v_payment_amount numeric;
  v_source text;
  v_collection_method text;
  v_receipt_path text;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  v_driver_collection boolean;
  v_committed_excluding_current numeric;
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO role required';
  end if;

  select payment.event, payment.order_id, payment.amount_etb,
    coalesce(payment.raw_payload ->> 'source', ''),
    lower(coalesce(payment.raw_payload ->> 'collection_method', '')),
    payment.receipt_path, trip_order.status, coalesce(trip_order.price_etb, 0)
  into v_event, v_order_id, v_payment_amount, v_source,
    v_collection_method, v_receipt_path, v_order_status, v_order_total
  from public.payments payment
  join public.orders trip_order on trip_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, trip_order;

  if not found then raise exception 'Payment not found'; end if;
  if v_event <> 'initiated' then
    raise exception 'Only initiated payments can be reviewed';
  end if;

  v_driver_collection := v_source = 'driver_collection';

  if p_approve then
    if v_driver_collection and v_order_status <> 'delivered' then
      raise exception 'Driver-collected payment can only be verified after delivery';
    end if;
    if not (v_driver_collection and v_collection_method = 'cash')
      and nullif(btrim(coalesce(v_receipt_path, '')), '') is null then
      raise exception 'Payment evidence is required before approval';
    end if;

    select coalesce(sum(case
      when payment.event in ('held_escrow', 'released') then payment.amount_etb
      when payment.event = 'refunded' then -payment.amount_etb else 0 end), 0)
    into v_committed_excluding_current
    from public.payments payment
    where payment.order_id = v_order_id and payment.id <> p_payment_id;

    if v_committed_excluding_current + v_payment_amount > v_order_total + 0.005 then
      raise exception 'Approval exceeds the remaining invoice balance by ETB %',
        (v_committed_excluding_current + v_payment_amount - v_order_total);
    end if;

    update public.payments
    set event = case when v_driver_collection
          then 'released'::public.payment_event
          else 'held_escrow'::public.payment_event end,
        reviewed_by = v_actor,
        reviewed_at = now(),
        rejection_reason = null
    where id = p_payment_id;
  else
    if v_reason is null or char_length(v_reason) < 5 then
      raise exception 'Write a rejection reason of at least 5 characters';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'Rejection reason must be 500 characters or fewer';
    end if;

    update public.payments
    set event = 'failed', reviewed_by = v_actor,
        reviewed_at = now(), rejection_reason = v_reason
    where id = p_payment_id;

    update public.customer_dispatch_requests
    set status = 'expired', updated_at = now()
    where order_id = v_order_id and status = 'requested';
  end if;

  perform public.recompute_order_payment_status(v_order_id);
end;
$$;

revoke all on function public.admin_review_customer_payment(uuid, boolean, text)
  from public, anon;
grant execute on function public.admin_review_customer_payment(uuid, boolean, text)
  to authenticated;

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
as $$
declare
  v_actor uuid := auth.uid();
  v_customer uuid;
  v_driver uuid;
  v_leadership boolean;
begin
  select trip_order.customer_id, trip_order.driver_id
  into v_customer, v_driver
  from public.orders trip_order
  where trip_order.id = p_order_id;

  if not found then raise exception 'Order not found'; end if;
  if v_actor is null then raise exception 'Authentication required'; end if;
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
        select 1 from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = charge.payment_id
      )
  ), effective_commission as (
    select canonical.payment_id,
      greatest(canonical.original_commission
        - coalesce(sum(correction.driver_commission_reversal_etb), 0), 0)
        as amount
    from canonical_commission canonical
    left join public.financial_corrections correction
      on correction.source_payment_id = canonical.payment_id
    group by canonical.payment_id, canonical.original_commission
  ), values_for_state as (
    select trip_order.*,
      payment_totals.*,
      greatest(payment_totals.released + payment_totals.held
        - payment_totals.refunded, 0)::numeric as verified_net,
      greatest(coalesce(trip_order.price_etb, 0)
        - greatest(payment_totals.released + payment_totals.held
          - payment_totals.refunded, 0), 0)::numeric as balance_due
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
      then coalesce((select sum(effective.amount) from effective_commission effective), 0)
      else 0
    end::numeric,
    case
      when state.status = 'cancelled' then 'cancelled'
      when state.status <> 'delivered' then 'delivery_pending'
      when state.balance_due = 0 and state.released > state.refunded then 'released'
      when state.held > 0 then 'awaiting_driver_confirmation'
      when state.initiated > 0 then 'awaiting_admin_review'
      when state.balance_due > 0 then 'payment_required'
      when state.refunded > 0 then 'refunded'
      else 'payment_open'
    end,
    exists (select 1 from public.delivery_proofs proof where proof.order_id = p_order_id),
    (select rating.score from public.ratings rating where rating.order_id = p_order_id)
  from values_for_state state;
end;
$$;

revoke all on function public.trip_completion_summary(uuid) from public, anon;
grant execute on function public.trip_completion_summary(uuid) to authenticated;

notify pgrst, 'reload schema';
