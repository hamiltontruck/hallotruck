create index if not exists orders_status_accepted_at_idx
  on public.orders (status, accepted_at, created_at desc);
create index if not exists customers_created_at_desc_idx
  on public.customers (created_at desc);
create index if not exists trucks_status_idx
  on public.trucks (status);
create index if not exists profiles_role_driver_status_idx
  on public.profiles (role, driver_status);
create index if not exists driver_verification_status_expiry_idx
  on public.driver_verification_files (status, expiry_date);

create or replace function public.admin_control_center_v2_report()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today_start timestamptz := date_trunc('day', timezone('Africa/Addis_Ababa', now())) at time zone 'Africa/Addis_Ababa';
  v_today_end timestamptz := (date_trunc('day', timezone('Africa/Addis_Ababa', now())) + interval '1 day') at time zone 'Africa/Addis_Ababa';
  v_result jsonb;
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  with ranked_payments as (
    select p.*,
      row_number() over (
        partition by p.order_id, p.event,
          lower(btrim(coalesce(p.provider, ''))),
          coalesce(nullif(lower(btrim(coalesce(p.provider_ref, ''))), ''), p.id::text),
          coalesce(p.amount_etb, 0)
        order by p.created_at desc, p.id desc
      ) as rn
    from public.payments p
  ), canonical_payments as (
    select * from ranked_payments where rn = 1
  ), legacy_orders as (
    select distinct p.order_id
    from canonical_payments p
    where p.event = 'released'
      and coalesce(p.raw_payload ->> 'legacy_completed', 'false') = 'true'
  ), delayed_orders as (
    select o.*
    from public.orders o
    where o.status in ('accepted', 'in_transit')
      and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours'
  ), unassigned_orders as (
    select o.*
    from public.orders o
    where o.status not in ('delivered', 'cancelled')
      and (o.driver_id is null or o.truck_id is null)
  ), missing_evidence_orders as (
    select o.*
    from public.orders o
    where o.status = 'delivered'
      and not exists (select 1 from public.delivery_proofs dp where dp.order_id = o.id)
      and not exists (select 1 from legacy_orders lo where lo.order_id = o.id)
  ), compliance_documents as (
    select d.*
    from public.driver_verification_files d
    where d.status in ('pending', 'rejected', 'expired')
       or (d.expiry_date is not null and d.expiry_date <= (current_date + 30))
  ), onboarding_drivers as (
    select p.*
    from public.profiles p
    where p.role::text = 'driver'
      and lower(coalesce(p.driver_status, '')) not in ('approved', 'suspended')
  ), maintenance_trucks as (
    select t.*
    from public.trucks t
    where t.status in ('maintenance', 'service_due', 'out_of_service', 'inspection_due')
  ), cash_liability as (
    select c.driver_id, coalesce(sum(c.commission_etb), 0)::numeric as amount
    from public.driver_commission_charges c
    join public.payments p on p.id = c.payment_id
    where c.status = 'active'
      and lower(replace(btrim(coalesce(p.provider, '')), ' ', '_')) in ('cash', 'cash_to_driver', 'driver_cash')
    group by c.driver_id
  ), approved_commission_payments as (
    select p.driver_id, coalesce(sum(p.amount_etb), 0)::numeric as amount
    from public.driver_commission_payments p
    where p.status = 'approved'
    group by p.driver_id
  ), active_deposits as (
    select d.driver_id, coalesce(sum(d.amount_etb), 0)::numeric as amount
    from public.driver_commission_deposits d
    where d.status = 'active'
    group by d.driver_id
  ), driver_finance as (
    select
      d.id as driver_id,
      coalesce(cl.amount, 0)::numeric as cash_liability,
      coalesce(cp.amount, 0)::numeric as commission_paid,
      coalesce(ad.amount, 0)::numeric as deposited,
      greatest(0, coalesce(cl.amount, 0) - least(coalesce(cl.amount, 0), coalesce(cp.amount, 0)))::numeric as unpaid_cash
    from public.profiles d
    left join cash_liability cl on cl.driver_id = d.id
    left join approved_commission_payments cp on cp.driver_id = d.id
    left join active_deposits ad on ad.driver_id = d.id
    where d.role::text = 'driver'
  ), finance_totals as (
    select
      coalesce(sum(greatest(0, unpaid_cash - deposited)), 0)::numeric as commission_receivable,
      coalesce(sum(deposited), 0)::numeric as total_driver_deposit,
      coalesce(sum(greatest(0, deposited - unpaid_cash)), 0)::numeric as available_driver_deposit
    from driver_finance
  ), delayed_or_unassigned_preview as (
    select distinct on (o.id)
      o.id, o.tracking_id, o.customer_name, o.pickup_address, o.dropoff_address,
      o.status, o.payment_status, o.driver_id, o.truck_id, o.accepted_at, o.delivered_at, o.created_at
    from public.orders o
    where (
      (o.status in ('accepted', 'in_transit') and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours')
      or
      (o.status not in ('delivered', 'cancelled') and (o.driver_id is null or o.truck_id is null))
    )
    order by o.id, o.created_at desc
  ), pending_payment_preview as (
    select * from canonical_payments where event = 'initiated' order by created_at desc, id desc limit 6
  ), legacy_payment_preview as (
    select * from canonical_payments
    where event = 'released' and coalesce(raw_payload ->> 'legacy_completed', 'false') = 'true'
    order by created_at desc, id desc limit 6
  ), exception_payment_preview as (
    select * from canonical_payments where event in ('failed', 'refunded') order by created_at desc, id desc limit 6
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'todayRevenue', greatest(0, coalesce((select sum(case when p.event = 'released' then greatest(coalesce(p.amount_etb, 0), 0) when p.event = 'refunded' then -greatest(coalesce(p.amount_etb, 0), 0) else 0 end) from canonical_payments p where p.created_at >= v_today_start and p.created_at < v_today_end), 0)),
      'totalOrders', (select count(*) from public.orders),
      'todayOrders', (select count(*) from public.orders o where o.created_at >= v_today_start and o.created_at < v_today_end),
      'activeTrips', (select count(*) from public.orders o where o.status in ('accepted', 'in_transit')),
      'deliveredToday', (select count(*) from public.orders o where o.status = 'delivered' and o.delivered_at >= v_today_start and o.delivered_at < v_today_end),
      'delayedTrips', (select count(*) from delayed_orders),
      'unassignedOrders', (select count(*) from unassigned_orders),
      'availableTrucks', (select count(*) from public.trucks t where t.status = 'available'),
      'totalTrucks', (select count(*) from public.trucks),
      'activeDrivers', (select count(*) from public.profiles p where p.role::text = 'driver' and lower(coalesce(p.driver_status, '')) in ('active','available','online','busy','approved')),
      'totalDrivers', (select count(*) from public.profiles p where p.role::text = 'driver'),
      'newCustomersToday', (select count(*) from public.customers c where c.created_at >= v_today_start and c.created_at < v_today_end),
      'pendingPayments', (select count(*) from canonical_payments p where p.event = 'initiated'),
      'missingEvidence', (select count(*) from missing_evidence_orders),
      'legacyCompleted', (select count(*) from legacy_orders),
      'commissionReceivable', (select commission_receivable from finance_totals),
      'totalDriverDeposit', (select total_driver_deposit from finance_totals),
      'availableDriverDeposit', (select available_driver_deposit from finance_totals),
      'complianceDocumentAlerts', (select count(*) from compliance_documents),
      'driverOnboardingAlerts', (select count(*) from onboarding_drivers),
      'maintenanceAlerts', (select count(*) from maintenance_trucks),
      'releasedAmount', coalesce((select sum(greatest(coalesce(p.amount_etb, 0), 0)) from canonical_payments p where p.event = 'released'), 0),
      'escrowAmount', coalesce((select sum(greatest(coalesce(p.amount_etb, 0), 0)) from canonical_payments p where p.event = 'held_escrow'), 0),
      'refundedAmount', coalesce((select sum(greatest(coalesce(p.amount_etb, 0), 0)) from canonical_payments p where p.event = 'refunded'), 0),
      'failedPayments', (select count(*) from canonical_payments p where p.event = 'failed'),
      'failedOrRefundedPayments', (select count(*) from canonical_payments p where p.event in ('failed','refunded')),
      'canonicalPayments', (select count(*) from canonical_payments)
    ),
    'queues', jsonb_build_object(
      'delayedOrUnassigned', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from delayed_or_unassigned_preview order by created_at desc limit 6) x), '[]'::jsonb),
      'pendingPayments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from pending_payment_preview x), '[]'::jsonb),
      'missingEvidence', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,tracking_id,customer_name,pickup_address,dropoff_address,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,created_at from missing_evidence_orders order by delivered_at desc nulls last, created_at desc limit 6) x), '[]'::jsonb),
      'legacyPayments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from legacy_payment_preview x), '[]'::jsonb),
      'failedOrRefundedPayments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from exception_payment_preview x), '[]'::jsonb),
      'maintenanceTrucks', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plate_number', x.plate_number, 'status', x.status) order by x.created_at desc) from (select * from maintenance_trucks order by created_at desc limit 6) x), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_control_center_v2_report() from public, anon;
grant execute on function public.admin_control_center_v2_report() to authenticated;
