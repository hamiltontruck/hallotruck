create or replace function public.admin_intelligence_v2(
  p_range text default '30d',
  p_query text default '',
  p_search_limit integer default 6,
  p_search_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_local_today date := timezone('Africa/Addis_Ababa', v_now)::date;
  v_start timestamptz;
  v_q text := lower(trim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_search_limit, 6), 1), 50);
  v_offset integer := greatest(coalesce(p_search_offset, 0), 0);
  v_result jsonb;
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  if p_range = 'today' then
    v_start := v_local_today::timestamp at time zone 'Africa/Addis_Ababa';
  elsif p_range = '7d' then
    v_start := (v_local_today - 6)::timestamp at time zone 'Africa/Addis_Ababa';
  elsif p_range = '30d' then
    v_start := (v_local_today - 29)::timestamp at time zone 'Africa/Addis_Ababa';
  elsif p_range = '90d' then
    v_start := (v_local_today - 89)::timestamp at time zone 'Africa/Addis_Ababa';
  elsif p_range = 'all' then
    v_start := null;
  else
    raise exception 'Unsupported report range: %', p_range using errcode = '22023';
  end if;

  with
  range_orders as (
    select o.* from public.orders o where v_start is null or o.created_at >= v_start
  ),
  range_payments as (
    select p.* from public.payments p where v_start is null or p.created_at >= v_start
  ),
  range_customers as (
    select c.* from public.customers c where v_start is null or c.created_at >= v_start
  ),
  order_stats as (
    select
      count(*)::bigint as orders,
      count(*) filter (where status = 'delivered')::bigint as delivered,
      count(*) filter (where status = 'cancelled')::bigint as cancelled,
      count(*) filter (where status in ('accepted','in_transit'))::bigint as active,
      count(*) filter (where status not in ('delivered','cancelled') and (driver_id is null or truck_id is null))::bigint as unassigned,
      coalesce(sum(greatest(coalesce(price_etb,0),0)),0)::numeric as invoice_etb
    from range_orders
  ),
  payment_stats as (
    select
      coalesce(sum(greatest(coalesce(amount_etb,0),0)) filter (where event='released'),0)::numeric as released,
      coalesce(sum(greatest(coalesce(amount_etb,0),0)) filter (where event='refunded'),0)::numeric as refunded,
      count(*) filter (where event='initiated')::bigint as pending_count,
      coalesce(sum(greatest(coalesce(amount_etb,0),0)) filter (where event='initiated'),0)::numeric as pending_etb,
      count(*) filter (where event='held_escrow')::bigint as held_count,
      coalesce(sum(greatest(coalesce(amount_etb,0),0)) filter (where event='held_escrow'),0)::numeric as escrow_etb
    from range_payments
  ),
  fleet_stats as (
    select count(*)::bigint as total_trucks,
      count(*) filter (where status='assigned')::bigint as assigned_trucks,
      count(*) filter (where status='available')::bigint as available_trucks
    from public.trucks
  ),
  driver_stats as (
    select count(*)::bigint as total_drivers,
      count(*) filter (where driver_status='approved')::bigint as approved_drivers
    from public.profiles where role='driver'
  ),
  coverage as (
    select
      (select count(*) from public.orders)::bigint as orders,
      (select count(*) from public.customers)::bigint as customers,
      (select count(*) from public.profiles where role='driver')::bigint as drivers,
      (select count(*) from public.trucks)::bigint as trucks,
      (select count(*) from public.payments)::bigint as payments
  ),
  top_routes as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.orders desc, x.invoice_etb desc), '[]'::jsonb) as rows
    from (
      select concat(pickup_address, ' → ', dropoff_address) as route,
        count(*)::bigint as orders,
        count(*) filter (where status='delivered')::bigint as delivered,
        coalesce(sum(greatest(coalesce(price_etb,0),0)),0)::numeric as invoice_etb
      from range_orders
      group by pickup_address, dropoff_address
      order by count(*) desc, coalesce(sum(greatest(coalesce(price_etb,0),0)),0) desc
      limit 5
    ) x
  ),
  status_breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]'::jsonb) as rows
    from (select status, count(*)::bigint as count from range_orders group by status) x
  ),
  provider_breakdown as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.amount_etb desc), '[]'::jsonb) as rows
    from (
      select coalesce(nullif(provider,''),'Unknown') as provider,
        count(*)::bigint as records,
        coalesce(sum(greatest(coalesce(amount_etb,0),0)),0)::numeric as amount_etb
      from range_payments group by coalesce(nullif(provider,''),'Unknown')
    ) x
  ),
  revenue_trend as (
    select coalesce(jsonb_agg(jsonb_build_object('date', d.day::text, 'amountEtb', greatest(0, coalesce(s.released,0)-coalesce(s.refunded,0))) order by d.day), '[]'::jsonb) as rows
    from generate_series(v_local_today - 6, v_local_today, interval '1 day') d(day)
    left join lateral (
      select
        coalesce(sum(greatest(coalesce(p.amount_etb,0),0)) filter (where p.event='released'),0)::numeric as released,
        coalesce(sum(greatest(coalesce(p.amount_etb,0),0)) filter (where p.event='refunded'),0)::numeric as refunded
      from public.payments p
      where p.created_at >= d.day::timestamp at time zone 'Africa/Addis_Ababa'
        and p.created_at < (d.day + interval '1 day')::timestamp at time zone 'Africa/Addis_Ababa'
    ) s on true
  ),
  order_matches as (
    select o.* from public.orders o
    where v_q <> '' and position(v_q in lower(concat_ws(' ',o.tracking_id,o.customer_name,o.customer_phone,o.pickup_address,o.dropoff_address,o.cargo_description,o.vehicle_type,o.status,o.payment_status))) > 0
  ),
  customer_matches as (
    select c.* from public.customers c
    where v_q <> '' and position(v_q in lower(concat_ws(' ',c.full_name,c.phone,c.email,c.company_name,case when c.is_credit_customer then 'credit customer' else 'standard customer' end))) > 0
  ),
  driver_matches as (
    select p.* from public.profiles p
    where p.role='driver' and v_q <> '' and position(v_q in lower(concat_ws(' ',p.full_name,p.phone,p.driver_status))) > 0
  ),
  truck_matches as (
    select t.* from public.trucks t
    where v_q <> '' and position(v_q in lower(concat_ws(' ',t.plate_number,t.vehicle_type,t.capacity_tons,t.status))) > 0
  ),
  payment_matches as (
    select p.*, o.tracking_id, o.customer_name, o.customer_phone, o.pickup_address, o.dropoff_address, o.driver_id,
      d.full_name as driver_name, d.phone as driver_phone
    from public.payments p
    left join public.orders o on o.id=p.order_id
    left join public.profiles d on d.id=o.driver_id
    where v_q <> '' and position(v_q in lower(concat_ws(' ',p.provider,p.provider_ref,p.amount_etb,p.event,o.tracking_id,o.customer_name,o.customer_phone,o.pickup_address,o.dropoff_address,d.full_name,d.phone))) > 0
  ),
  search_counts as (
    select
      (select count(*) from order_matches)::bigint as orders,
      (select count(*) from customer_matches)::bigint as customers,
      (select count(*) from driver_matches)::bigint as drivers,
      (select count(*) from truck_matches)::bigint as trucks,
      (select count(*) from payment_matches)::bigint as payments
  ),
  search_rows as (
    select jsonb_build_object(
      'orders', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from order_matches order by created_at desc limit v_limit offset v_offset) x), '[]'::jsonb),
      'customers', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from customer_matches order by created_at desc limit v_limit offset v_offset) x), '[]'::jsonb),
      'drivers', coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name nulls last) from (select id,full_name,phone,driver_status from driver_matches order by full_name nulls last limit v_limit offset v_offset) x), '[]'::jsonb),
      'trucks', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from truck_matches order by created_at desc limit v_limit offset v_offset) x), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from payment_matches order by created_at desc limit v_limit offset v_offset) x), '[]'::jsonb)
    ) as rows
  )
  select jsonb_build_object(
    'range', p_range,
    'generatedAt', v_now,
    'coverage', to_jsonb(cov),
    'report', jsonb_build_object(
      'orderCount', os.orders,
      'deliveredCount', os.delivered,
      'cancelledCount', os.cancelled,
      'activeCount', os.active,
      'unassignedCount', os.unassigned,
      'invoiceEtb', os.invoice_etb,
      'averageOrderEtb', case when os.orders > 0 then round(os.invoice_etb/os.orders) else 0 end,
      'completionRate', case when (os.orders-os.cancelled) > 0 then round((os.delivered::numeric/(os.orders-os.cancelled))*100) else 0 end,
      'released', ps.released,
      'refunded', ps.refunded,
      'netRevenue', greatest(0,ps.released-ps.refunded),
      'pendingCount', ps.pending_count,
      'pendingEtb', ps.pending_etb,
      'heldCount', ps.held_count,
      'escrowEtb', ps.escrow_etb,
      'customerCount', (select count(*) from range_customers),
      'totalCustomers', cov.customers,
      'approvedDrivers', ds.approved_drivers,
      'availableTrucks', fs.available_trucks,
      'fleetUtilization', case when fs.total_trucks>0 then round((fs.assigned_trucks::numeric/fs.total_trucks)*100) else 0 end,
      'attentionCount', os.unassigned + ps.pending_count + ps.held_count,
      'topRoutes', tr.rows,
      'statusBreakdown', sb.rows,
      'providerBreakdown', pb.rows,
      'revenueTrend', rt.rows
    ),
    'search', jsonb_build_object(
      'query', p_query,
      'limit', v_limit,
      'offset', v_offset,
      'counts', to_jsonb(sc),
      'total', sc.orders+sc.customers+sc.drivers+sc.trucks+sc.payments,
      'rows', sr.rows
    )
  ) into v_result
  from order_stats os cross join payment_stats ps cross join fleet_stats fs cross join driver_stats ds
  cross join coverage cov cross join top_routes tr cross join status_breakdown sb cross join provider_breakdown pb
  cross join revenue_trend rt cross join search_counts sc cross join search_rows sr;

  return v_result;
end;
$$;

revoke execute on function public.admin_intelligence_v2(text,text,integer,integer) from public;
revoke execute on function public.admin_intelligence_v2(text,text,integer,integer) from anon;
grant execute on function public.admin_intelligence_v2(text,text,integer,integer) to authenticated;

create index if not exists orders_admin_intelligence_created_at_idx on public.orders(created_at desc);
create index if not exists payments_admin_intelligence_created_at_idx on public.payments(created_at desc);
create index if not exists customers_admin_intelligence_created_at_idx on public.customers(created_at desc);
