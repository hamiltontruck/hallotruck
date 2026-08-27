-- Close legacy anonymous finance RPC grants and use the database-backed
-- leadership role for privileged payment reporting. Existing ledger rows and
-- payment calculations are intentionally unchanged.

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
  select orders.customer_id, orders.driver_id
  into v_customer, v_driver
  from public.orders orders
  where orders.id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

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
      coalesce(orders.price_etb, 0)::numeric as invoice_total,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'initiated'), 0)::numeric as initiated,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'held_escrow'), 0)::numeric as held,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'released'), 0)::numeric as released,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'refunded'), 0)::numeric as refunded
    from public.orders orders
    left join public.payments payments on payments.order_id = orders.id
    where orders.id = p_order_id
    group by orders.id, orders.price_etb
  ), calculated as (
    select totals.*, totals.released + totals.held - totals.refunded as raw_verified
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

revoke all on function public.order_payment_financial_summary(uuid) from public, anon;
grant execute on function public.order_payment_financial_summary(uuid) to authenticated, service_role;

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
      orders.id as order_key,
      orders.tracking_id as tracking_key,
      coalesce(orders.price_etb, 0)::numeric as invoice_total,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'initiated'), 0)::numeric as initiated_total,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'held_escrow'), 0)::numeric as held_total,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'released'), 0)::numeric as released_total,
      coalesce(sum(payments.amount_etb) filter (where payments.event = 'refunded'), 0)::numeric as refunded_total
    from public.orders orders
    left join public.payments payments on payments.order_id = orders.id
    group by orders.id, orders.tracking_id, orders.price_etb
  ), calc as (
    select totals.*, totals.released_total + totals.held_total - totals.refunded_total as raw_verified
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

revoke all on function public.admin_payment_integrity_report() from public, anon;
grant execute on function public.admin_payment_integrity_report() to authenticated;

-- Trigger functions execute through their owning table triggers and do not
-- require direct PostgREST EXECUTE privileges.
revoke all on function public.audit_payment_review_transition() from public, anon, authenticated;
revoke all on function public.enforce_verified_payment_before_dispatch() from public, anon, authenticated;
revoke all on function public.enforce_verified_payment_before_dispatch_request() from public, anon, authenticated;
revoke all on function public.prepare_payment_review_metadata() from public, anon, authenticated;

notify pgrst, 'reload schema';
