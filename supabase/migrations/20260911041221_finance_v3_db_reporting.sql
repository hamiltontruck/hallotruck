create index if not exists payments_event_provider_created_at_idx
  on public.payments (event, provider, created_at desc, id desc);
create index if not exists orders_driver_customer_vehicle_idx
  on public.orders (driver_id, customer_id, vehicle_type);

create or replace function public.admin_finance_v3_report(
  p_range text default '30d',
  p_provider text default null,
  p_driver_query text default null,
  p_customer_query text default null,
  p_route_query text default null,
  p_truck_query text default null,
  p_search text default null,
  p_event text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := case when p_page_size = 100 then 100 else 50 end;
  v_start timestamptz;
  v_today timestamptz := (date_trunc('day', timezone('Africa/Addis_Ababa', now())) at time zone 'Africa/Addis_Ababa');
  v_week timestamptz := ((date_trunc('day', timezone('Africa/Addis_Ababa', now())) - interval '6 days') at time zone 'Africa/Addis_Ababa');
  v_month timestamptz := (date_trunc('month', timezone('Africa/Addis_Ababa', now())) at time zone 'Africa/Addis_Ababa');
  v_days integer := case when p_range = '90d' then 30 else 14 end;
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required';
  end if;

  v_start := case p_range
    when 'today' then v_today
    when '7d' then v_week
    when '30d' then ((date_trunc('day', timezone('Africa/Addis_Ababa', now())) - interval '29 days') at time zone 'Africa/Addis_Ababa')
    when '90d' then ((date_trunc('day', timezone('Africa/Addis_Ababa', now())) - interval '89 days') at time zone 'Africa/Addis_Ababa')
    else null
  end;

  return (
    with order_scope as (
      select o.id, o.tracking_id, o.customer_id, o.customer_name, o.customer_phone,
             o.driver_id, o.truck_id, o.pickup_address, o.dropoff_address,
             o.vehicle_type, o.price_etb, o.status::text as status,
             o.payment_status::text as payment_status, o.created_at,
             d.full_name as driver_name, d.phone as driver_phone
      from public.orders o
      left join public.profiles d on d.id = o.driver_id
      where (nullif(trim(p_driver_query), '') is null
             or coalesce(d.full_name, '') ilike '%' || trim(p_driver_query) || '%'
             or coalesce(d.phone, '') ilike '%' || trim(p_driver_query) || '%')
        and (nullif(trim(p_customer_query), '') is null
             or coalesce(o.customer_name, '') ilike '%' || trim(p_customer_query) || '%'
             or coalesce(o.customer_phone, '') ilike '%' || trim(p_customer_query) || '%')
        and (nullif(trim(p_route_query), '') is null
             or (coalesce(o.pickup_address, '') || ' → ' || coalesce(o.dropoff_address, '')) ilike '%' || trim(p_route_query) || '%')
        and (nullif(trim(p_truck_query), '') is null
             or coalesce(o.vehicle_type, '') ilike '%' || trim(p_truck_query) || '%')
    ),
    payment_scope as (
      select p.id, p.order_id, p.provider, p.provider_ref, p.amount_etb,
             p.event::text as event, p.created_at, p.reviewed_at,
             o.tracking_id, o.customer_name, o.customer_phone, o.driver_id,
             o.pickup_address, o.dropoff_address, o.vehicle_type,
             o.price_etb, o.status, o.payment_status,
             o.driver_name, o.driver_phone
      from public.payments p
      join order_scope o on o.id = p.order_id
      where (v_start is null or p.created_at >= v_start)
        and (nullif(trim(p_provider), '') is null or p_provider = 'all' or p.provider = p_provider)
        and (
          nullif(trim(p_search), '') is null
          or coalesce(o.tracking_id, '') ilike '%' || trim(p_search) || '%'
          or coalesce(o.customer_name, '') ilike '%' || trim(p_search) || '%'
          or coalesce(o.pickup_address, '') ilike '%' || trim(p_search) || '%'
          or coalesce(o.dropoff_address, '') ilike '%' || trim(p_search) || '%'
          or coalesce(o.vehicle_type, '') ilike '%' || trim(p_search) || '%'
          or coalesce(o.driver_name, '') ilike '%' || trim(p_search) || '%'
          or coalesce(p.provider, '') ilike '%' || trim(p_search) || '%'
          or coalesce(p.provider_ref, '') ilike '%' || trim(p_search) || '%'
        )
    ),
    drill_scope as (
      select * from payment_scope
      where nullif(trim(p_event), '') is null or p_event = 'all' or event = p_event
    ),
    drill_count as (select count(*)::bigint as total from drill_scope),
    drill_rows as (
      select * from drill_scope
      order by created_at desc, id desc
      offset (v_page - 1) * v_page_size
      limit v_page_size
    ),
    charge_base as (
      select payment_id, max(commission_etb)::numeric as amount
      from public.driver_commission_charges where status = 'active' group by payment_id
    ),
    confirmation_base as (
      select payment_id,
             max(case when commission_reversed_at is null then commission_etb else 0 end)::numeric as amount
      from public.driver_payment_confirmations group by payment_id
    ),
    correction_base as (
      select source_payment_id as payment_id,
             sum(coalesce(driver_commission_reversal_etb, 0))::numeric as reversal
      from public.financial_corrections where source_payment_id is not null group by source_payment_id
    ),
    commission_keys as (
      select payment_id from charge_base union select payment_id from confirmation_base
    ),
    canonical_commission as (
      select coalesce(sum(greatest(coalesce(c.amount, ch.amount, 0) - coalesce(r.reversal, 0), 0)), 0)::numeric as earned
      from commission_keys k
      left join charge_base ch on ch.payment_id = k.payment_id
      left join confirmation_base c on c.payment_id = k.payment_id
      left join correction_base r on r.payment_id = k.payment_id
    ),
    commission_paid as (
      select coalesce(sum(amount_etb), 0)::numeric as paid from public.driver_commission_payments where status = 'approved'
    ),
    deposits as (
      select coalesce(sum(amount_etb), 0)::numeric as total, count(distinct driver_id)::bigint as wallets
      from public.driver_commission_deposits where status = 'active'
    ),
    payment_summary as (
      select
        coalesce(sum(amount_etb) filter (where event = 'released' and created_at >= v_today), 0)::numeric as today_revenue,
        coalesce(sum(amount_etb) filter (where event = 'released' and created_at >= v_week), 0)::numeric as weekly_revenue,
        coalesce(sum(amount_etb) filter (where event = 'released' and created_at >= v_month), 0)::numeric as monthly_revenue,
        coalesce(sum(amount_etb) filter (where event = 'released'), 0)::numeric as released,
        coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0)::numeric as escrow,
        count(*) filter (where event = 'initiated' and reviewed_at is null)::bigint as pending,
        coalesce(sum(amount_etb) filter (where event = 'refunded'), 0)::numeric as refunded,
        coalesce(sum(amount_etb) filter (where event = 'failed'), 0)::numeric as failed
      from payment_scope
    ),
    trend_days as (
      select day::date as day
      from generate_series(timezone('Africa/Addis_Ababa', now())::date - (v_days - 1), timezone('Africa/Addis_Ababa', now())::date, interval '1 day') day
    ),
    trend as (
      select td.day,
        coalesce(sum(ps.amount_etb) filter (where ps.event = 'released'), 0)::numeric as revenue,
        coalesce(sum(ps.amount_etb) filter (where ps.event = 'held_escrow'), 0)::numeric as escrow,
        coalesce(sum(ps.amount_etb) filter (where ps.event = 'released'), 0)::numeric * 0.02 as commission
      from trend_days td
      left join payment_scope ps
        on ps.created_at >= (td.day::timestamp at time zone 'Africa/Addis_Ababa')
       and ps.created_at < ((td.day + 1)::timestamp at time zone 'Africa/Addis_Ababa')
      group by td.day order by td.day
    ),
    provider_breakdown as (
      select provider as label, sum(amount_etb)::numeric as value from payment_scope where event = 'released' group by provider order by value desc limit 8
    ),
    route_breakdown as (
      select (pickup_address || ' → ' || dropoff_address) as label, sum(amount_etb)::numeric as value from payment_scope where event = 'released' group by pickup_address, dropoff_address order by value desc limit 8
    ),
    driver_breakdown as (
      select coalesce(driver_name, driver_phone, 'Unassigned') as label, sum(amount_etb)::numeric as value from payment_scope where event = 'released' group by coalesce(driver_name, driver_phone, 'Unassigned') order by value desc limit 8
    ),
    customer_breakdown as (
      select coalesce(customer_name, 'Unknown customer') as label, sum(amount_etb)::numeric as value from payment_scope where event = 'released' group by coalesce(customer_name, 'Unknown customer') order by value desc limit 8
    ),
    truck_breakdown as (
      select coalesce(vehicle_type, 'Unknown') as label, sum(amount_etb)::numeric as value from payment_scope where event = 'released' group by coalesce(vehicle_type, 'Unknown') order by value desc limit 8
    ),
    signals as (
      select count(*) filter (where event = 'released' and amount_etb >= 100000)::bigint as high_value,
             count(*) filter (where event = 'held_escrow' and created_at < now() - interval '3 days')::bigint as old_escrow,
             count(*) filter (where event = 'refunded')::bigint as refunds,
             count(*) filter (where event = 'failed')::bigint as failed
      from payment_scope
    ),
    providers as (
      select coalesce(jsonb_agg(provider order by provider), '[]'::jsonb) as items
      from (select distinct provider from public.payments where provider is not null and provider <> '') x
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'todayRevenue', ps.today_revenue, 'weeklyRevenue', ps.weekly_revenue, 'monthlyRevenue', ps.monthly_revenue,
        'releasedPayments', ps.released, 'heldEscrow', ps.escrow, 'pendingReviews', ps.pending,
        'refundedPayments', ps.refunded, 'failedPayments', ps.failed, 'commissionEarned', cc.earned,
        'commissionPaid', cp.paid, 'outstandingCommission', greatest(cc.earned - cp.paid, 0),
        'driverDeposits', dep.total, 'availableDriverDeposits', greatest(dep.total - greatest(cc.earned - cp.paid, 0), 0),
        'netPlatformRevenue', greatest(cc.earned - ps.refunded, 0), 'activeWallets', dep.wallets
      ),
      'trend', (select coalesce(jsonb_agg(jsonb_build_object('date', day, 'revenue', revenue, 'escrow', escrow, 'commission', commission) order by day), '[]'::jsonb) from trend),
      'breakdowns', jsonb_build_object(
        'providers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from provider_breakdown x),
        'routes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from route_breakdown x),
        'drivers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from driver_breakdown x),
        'customers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from customer_breakdown x),
        'trucks', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from truck_breakdown x)
      ),
      'signals', jsonb_build_object('highValue', sig.high_value, 'oldEscrow', sig.old_escrow, 'refunds', sig.refunds, 'failed', sig.failed, 'depositMismatch', greatest(cc.earned - cp.paid, 0) > dep.total),
      'providers', pr.items,
      'drilldown', jsonb_build_object(
        'page', v_page, 'pageSize', v_page_size, 'total', dc.total,
        'totalPages', greatest(1, ceil(dc.total::numeric / v_page_size)::integer),
        'rows', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'order_id', r.order_id, 'provider', r.provider, 'provider_ref', r.provider_ref,
          'amount_etb', r.amount_etb, 'event', r.event, 'created_at', r.created_at, 'reviewed_at', r.reviewed_at,
          'tracking_id', r.tracking_id, 'customer_name', r.customer_name, 'driver_name', r.driver_name,
          'pickup_address', r.pickup_address, 'dropoff_address', r.dropoff_address, 'vehicle_type', r.vehicle_type
        ) order by r.created_at desc, r.id desc), '[]'::jsonb) from drill_rows r)
      )
    )
    from payment_summary ps
    cross join canonical_commission cc
    cross join commission_paid cp
    cross join deposits dep
    cross join signals sig
    cross join providers pr
    cross join drill_count dc
  );
end;
$$;

revoke all on function public.admin_finance_v3_report(text,text,text,text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_finance_v3_report(text,text,text,text,text,text,text,text,integer,integer) to authenticated;
