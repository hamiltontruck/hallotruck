-- Issue #248: repair legacy excess-refund accounting without rewriting immutable payment rows.
-- Restoration is an append-only financial correction. It is intentionally not a new
-- released payment, so Driver/Partner commission triggers cannot treat it as new money.

set local lock_timeout = '5s';

alter table public.financial_corrections
  add column if not exists external_evidence_reference text;

alter table public.financial_corrections
  drop constraint financial_corrections_correction_type_check,
  drop constraint financial_corrections_check;

alter table public.financial_corrections
  add constraint financial_corrections_correction_type_check
  check (correction_type in (
    'full_refund', 'partial_refund', 'duplicate', 'invalidated',
    'cancelled_order', 'reversed_settlement', 'legacy_refund_restoration'
  )),
  add constraint financial_corrections_check
  check (
    (
      correction_type = 'reversed_settlement'
      and partner_settlement_id is not null
      and source_payment_id is null
      and refund_payment_id is null
      and order_id is null
    )
    or
    (
      correction_type = 'legacy_refund_restoration'
      and source_payment_id is not null
      and refund_payment_id is null
      and partner_settlement_id is null
      and order_id is not null
      and driver_id is null
      and partner_id is null
      and driver_commission_reversal_etb = 0
      and partner_gross_reversal_etb = 0
      and partner_commission_reversal_etb = 0
      and partner_net_reversal_etb = 0
    )
    or
    (
      correction_type not in ('reversed_settlement', 'legacy_refund_restoration')
      and source_payment_id is not null
      and refund_payment_id is not null
      and partner_settlement_id is null
      and order_id is not null
    )
  ),
  add constraint financial_corrections_external_evidence_check
  check (
    external_evidence_reference is null
    or char_length(btrim(external_evidence_reference)) between 3 and 200
  ),
  add constraint financial_corrections_restoration_evidence_check
  check (
    correction_type <> 'legacy_refund_restoration'
    or char_length(btrim(coalesce(external_evidence_reference, ''))) between 3 and 200
  );

create or replace function private.legacy_refund_restoration_total(p_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(correction.amount_etb), 0)::numeric
  from public.financial_corrections correction
  where correction.order_id = p_order_id
    and correction.correction_type = 'legacy_refund_restoration';
$$;

revoke all on function private.legacy_refund_restoration_total(uuid)
  from public, anon, authenticated;

create or replace function public.admin_restore_legacy_excess_refund(
  p_refund_payment_id uuid,
  p_amount_etb numeric,
  p_reason text,
  p_external_evidence_reference text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_amount numeric := round(coalesce(p_amount_etb, 0), 2);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_external_evidence_reference, '')), '');
  v_order_id uuid;
  v_source_amount numeric;
  v_source_event public.payment_event;
  v_source_provider text;
  v_source_payload jsonb;
  v_source_restored numeric := 0;
  v_source_remaining numeric := 0;
  v_raw_verified numeric := 0;
  v_existing_restorations numeric := 0;
  v_ledger_anomaly numeric := 0;
  v_correction_id uuid := gen_random_uuid();
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then
    raise exception 'Restoration request key is required';
  end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.request_key = p_request_key
  ) then
    raise exception 'Restoration request was already processed';
  end if;
  if v_amount <= 0 then
    raise exception 'Restoration amount must be greater than zero';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Restoration reason must be at least 5 characters';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Restoration reason must be 500 characters or fewer';
  end if;
  if v_evidence is null or char_length(v_evidence) < 3 then
    raise exception 'External evidence reference is required';
  end if;
  if char_length(v_evidence) > 200 then
    raise exception 'External evidence reference must be 200 characters or fewer';
  end if;

  select payment.order_id, payment.amount_etb, payment.event,
         payment.provider, payment.raw_payload
  into v_order_id, v_source_amount, v_source_event,
       v_source_provider, v_source_payload
  from public.payments payment
  join public.orders payment_order on payment_order.id = payment.order_id
  where payment.id = p_refund_payment_id
  for update of payment, payment_order;

  if not found then raise exception 'Refund payment not found'; end if;
  if v_source_event <> 'refunded' then
    raise exception 'Only a refunded payment can be restored';
  end if;
  if lower(btrim(coalesce(v_source_provider, ''))) = 'financial_correction'
    or coalesce(v_source_payload, '{}'::jsonb) ? 'correction_id' then
    raise exception 'Auditable financial-correction refunds cannot be restored with the legacy workflow';
  end if;

  select coalesce(sum(correction.amount_etb), 0)
  into v_source_restored
  from public.financial_corrections correction
  where correction.source_payment_id = p_refund_payment_id
    and correction.correction_type = 'legacy_refund_restoration';

  v_source_remaining := greatest(round(v_source_amount - v_source_restored, 2), 0);
  if v_source_remaining <= 0 then
    raise exception 'This legacy refund has already been fully restored';
  end if;

  select coalesce(sum(case
    when payment.event in ('held_escrow', 'released') then payment.amount_etb
    when payment.event = 'refunded' then -payment.amount_etb
    else 0 end), 0)
  into v_raw_verified
  from public.payments payment
  where payment.order_id = v_order_id;

  v_existing_restorations := private.legacy_refund_restoration_total(v_order_id);
  v_ledger_anomaly := greatest(round(-(v_raw_verified + v_existing_restorations), 2), 0);

  if v_ledger_anomaly <= 0 then
    raise exception 'This order has no excess-refund ledger anomaly to restore';
  end if;
  if v_amount > v_ledger_anomaly + 0.005 then
    raise exception 'Restoration exceeds the current ledger anomaly by ETB %',
      round(v_amount - v_ledger_anomaly, 2);
  end if;
  if v_amount > v_source_remaining + 0.005 then
    raise exception 'Restoration exceeds the remaining legacy refund amount by ETB %',
      round(v_amount - v_source_remaining, 2);
  end if;

  insert into public.financial_corrections(
    id, request_key, correction_type, source_payment_id, refund_payment_id,
    partner_earning_id, partner_settlement_id, order_id, driver_id, partner_id,
    amount_etb, driver_commission_reversal_etb, partner_gross_reversal_etb,
    partner_commission_reversal_etb, partner_net_reversal_etb,
    reason, actor_id, external_evidence_reference
  ) values (
    v_correction_id, p_request_key, 'legacy_refund_restoration',
    p_refund_payment_id, null, null, null, v_order_id, null, null,
    v_amount, 0, 0, 0, 0,
    v_reason, v_actor, v_evidence
  );

  perform public.recompute_order_payment_status(v_order_id);
  return v_correction_id;
end;
$$;

revoke all on function public.admin_restore_legacy_excess_refund(uuid, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.admin_restore_legacy_excess_refund(uuid, numeric, text, text, uuid)
  to authenticated;

-- Central payment mutation guard: a pre-existing negative ledger must never create
-- artificial collection capacity, and no new refund may exceed effective verified funds.
create or replace function private.enforce_effective_payment_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice numeric := 0;
  v_initiated numeric := 0;
  v_held numeric := 0;
  v_released numeric := 0;
  v_refunded numeric := 0;
  v_restored numeric := 0;
  v_effective_verified numeric := 0;
  v_pending_plus_verified numeric := 0;
begin
  if tg_op = 'UPDATE'
    and old.event is distinct from new.event
    and new.event = 'refunded' then
    raise exception 'Refunds must be appended through the auditable financial correction workflow';
  end if;

  if new.event = 'failed' then return new; end if;

  select coalesce(payment_order.price_etb, 0)
  into v_invoice
  from public.orders payment_order
  where payment_order.id = new.order_id
  for update;

  if not found then return new; end if;

  select
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'initiated'), 0),
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'held_escrow'), 0),
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0),
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)
  into v_initiated, v_held, v_released, v_refunded
  from public.payments payment
  where payment.order_id = new.order_id
    and (tg_op = 'INSERT' or payment.id <> old.id);

  v_restored := private.legacy_refund_restoration_total(new.order_id);
  v_effective_verified := v_held + v_released - v_refunded + v_restored;

  if new.event = 'refunded' then
    if new.amount_etb > greatest(0, v_effective_verified) + 0.005 then
      raise exception 'Refund exceeds effective verified funds by ETB %',
        round(new.amount_etb - greatest(0, v_effective_verified), 2);
    end if;
    return new;
  end if;

  if new.event = 'initiated' then
    v_initiated := v_initiated + new.amount_etb;
  elsif new.event = 'held_escrow' then
    v_effective_verified := v_effective_verified + new.amount_etb;
  elsif new.event = 'released' then
    v_effective_verified := v_effective_verified + new.amount_etb;
  end if;

  v_pending_plus_verified := v_initiated + greatest(0, v_effective_verified);
  if v_pending_plus_verified > v_invoice + 0.005 then
    raise exception 'Payment exceeds the remaining invoice balance by ETB %',
      round(v_pending_plus_verified - v_invoice, 2);
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_effective_payment_balance()
  from public, anon, authenticated;

drop trigger if exists payments_effective_balance_guard on public.payments;
create trigger payments_effective_balance_guard
before insert or update of event, amount_etb, order_id on public.payments
for each row execute function private.enforce_effective_payment_balance();

create or replace function public.order_payment_financial_summary(p_order_id uuid)
returns table(
  invoice_total_etb numeric,
  initiated_etb numeric,
  held_escrow_etb numeric,
  released_etb numeric,
  refunded_etb numeric,
  verified_net_etb numeric,
  pending_verification_etb numeric,
  balance_due_etb numeric,
  customer_credit_etb numeric,
  ledger_anomaly_etb numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  v_customer uuid;
  v_driver uuid;
begin
  select payment_order.customer_id, payment_order.driver_id
  into v_customer, v_driver
  from public.orders payment_order
  where payment_order.id = p_order_id;

  if not found then raise exception 'Order not found'; end if;
  if v_uid is null and v_jwt_role <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if v_jwt_role <> 'service_role'
    and not (select private.is_admin_or_ceo())
    and v_uid is distinct from v_customer
    and v_uid is distinct from v_driver then
    raise exception 'You cannot view this order payment summary';
  end if;

  return query
  with totals as (
    select
      coalesce(payment_order.price_etb, 0)::numeric as invoice_total,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'initiated'), 0)::numeric as initiated,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'held_escrow'), 0)::numeric as held,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0)::numeric as released,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)::numeric as refunded,
      private.legacy_refund_restoration_total(payment_order.id)::numeric as restored
    from public.orders payment_order
    left join public.payments payment on payment.order_id = payment_order.id
    where payment_order.id = p_order_id
    group by payment_order.id, payment_order.price_etb
  ), calculated as (
    select totals.*, totals.released + totals.held - totals.refunded + totals.restored as raw_verified
    from totals
  )
  select
    calculated.invoice_total,
    calculated.initiated,
    calculated.held,
    calculated.released,
    calculated.refunded,
    greatest(0, calculated.raw_verified),
    greatest(0, calculated.initiated),
    greatest(0, calculated.invoice_total - greatest(0, calculated.raw_verified)),
    greatest(0, greatest(0, calculated.raw_verified) - calculated.invoice_total),
    greatest(0, -calculated.raw_verified)
  from calculated;
end;
$$;

create or replace function public.admin_payment_integrity_report()
returns table(
  order_id uuid,
  tracking_id text,
  invoice_total_etb numeric,
  verified_net_etb numeric,
  pending_etb numeric,
  balance_due_etb numeric,
  customer_credit_etb numeric,
  ledger_anomaly_etb numeric,
  issue text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO role required';
  end if;

  return query
  with totals as (
    select
      payment_order.id as order_key,
      payment_order.tracking_id as tracking_key,
      coalesce(payment_order.price_etb, 0)::numeric as invoice_total,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'initiated'), 0)::numeric as initiated_total,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'held_escrow'), 0)::numeric as held_total,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0)::numeric as released_total,
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)::numeric as refunded_total,
      private.legacy_refund_restoration_total(payment_order.id)::numeric as restored_total
    from public.orders payment_order
    left join public.payments payment on payment.order_id = payment_order.id
    group by payment_order.id, payment_order.tracking_id, payment_order.price_etb
  ), calc as (
    select totals.*,
      totals.released_total + totals.held_total - totals.refunded_total + totals.restored_total as raw_verified
    from totals
  )
  select
    calc.order_key,
    calc.tracking_key,
    calc.invoice_total,
    greatest(0, calc.raw_verified),
    greatest(0, calc.initiated_total),
    greatest(0, calc.invoice_total - greatest(0, calc.raw_verified)),
    greatest(0, greatest(0, calc.raw_verified) - calc.invoice_total),
    greatest(0, -calc.raw_verified),
    case
      when calc.raw_verified < 0 then 'Refunds exceed verified funds'
      when calc.raw_verified > calc.invoice_total + 0.005 then 'Verified funds exceed invoice total'
      when calc.initiated_total + greatest(0, calc.raw_verified) > calc.invoice_total + 0.005
        then 'Pending plus verified funds exceed invoice total'
      else 'OK'
    end
  from calc
  where calc.raw_verified < 0
    or calc.raw_verified > calc.invoice_total + 0.005
    or calc.initiated_total + greatest(0, calc.raw_verified) > calc.invoice_total + 0.005
  order by calc.tracking_key;
end;
$$;

create or replace function public.recompute_order_payment_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_released numeric;
  v_held numeric;
  v_refunded numeric;
  v_restored numeric;
  v_net_released numeric;
  v_has_refund boolean;
begin
  select coalesce(price_etb, 0)
  into v_total
  from public.orders
  where id = p_order_id
  for update;

  if not found then return; end if;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded'), 0),
    exists(select 1 from public.payments p2 where p2.order_id = p_order_id and p2.event = 'refunded')
  into v_released, v_held, v_refunded, v_has_refund
  from public.payments
  where order_id = p_order_id;

  v_restored := private.legacy_refund_restoration_total(p_order_id);
  v_net_released := greatest(0, v_released - v_refunded + v_restored);

  update public.orders
  set payment_status = case
    when v_total > 0 and v_net_released >= v_total then 'released'::public.payment_status
    when v_held > 0 or v_net_released > 0 then 'held_escrow'::public.payment_status
    when v_has_refund then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = p_order_id;
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
    from public.orders trip_order
    where trip_order.id = p_order_id
      and (
        trip_order.selected_payment_method = 'cash'
        or (
          trip_order.selected_payment_method = 'bank_telebirr'
          and coalesce(trip_order.price_etb, 0) > 0
          and greatest(0, coalesce((
            select sum(case
              when payment.event in ('held_escrow', 'released') then payment.amount_etb
              when payment.event = 'refunded' then -payment.amount_etb
              else 0 end)
            from public.payments payment
            where payment.order_id = trip_order.id
              and lower(replace(btrim(coalesce(payment.provider, '')), ' ', '_'))
                not in ('cash', 'cash_to_driver', 'driver_cash')
          ), 0) + private.legacy_refund_restoration_total(trip_order.id)) + 0.005
            >= coalesce(trip_order.price_etb, 0)
        )
      )
  );
$$;

-- Keep the existing API surface. These functions were already intentionally exposed to
-- authenticated callers with authorization enforced inside the function body.
revoke all on function public.order_payment_financial_summary(uuid) from public, anon;
grant execute on function public.order_payment_financial_summary(uuid) to authenticated;
revoke all on function public.admin_payment_integrity_report() from public, anon;
grant execute on function public.admin_payment_integrity_report() to authenticated;
revoke all on function public.order_payment_ready_for_dispatch(uuid) from public, anon;
grant execute on function public.order_payment_ready_for_dispatch(uuid) to authenticated;
revoke all on function public.recompute_order_payment_status(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
