-- Issue #248 follow-up guard: unresolved negative verified balance is a reconciliation
-- condition, not permission to collect another invoice amount. Fail closed until an
-- append-only legacy refund restoration (or other approved reconciliation) clears it.

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

  if tg_op = 'INSERT' then
    select
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'initiated'), 0),
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'held_escrow'), 0),
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0),
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)
    into v_initiated, v_held, v_released, v_refunded
    from public.payments payment
    where payment.order_id = new.order_id;
  else
    select
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'initiated'), 0),
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'held_escrow'), 0),
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0),
      coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)
    into v_initiated, v_held, v_released, v_refunded
    from public.payments payment
    where payment.order_id = new.order_id
      and payment.id <> old.id;
  end if;

  v_restored := private.legacy_refund_restoration_total(new.order_id);
  v_effective_verified := v_held + v_released - v_refunded + v_restored;

  if new.event in ('initiated', 'held_escrow', 'released')
    and v_effective_verified < -0.005 then
    raise exception 'Resolve the ledger anomaly before adding or advancing another payment';
  end if;

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

notify pgrst, 'reload schema';
