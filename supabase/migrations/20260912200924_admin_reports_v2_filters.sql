begin;

-- Read-only reporting RPC. This migration creates reporting logic only and does not
-- insert, update, delete or backfill any business row.
create or replace function public.admin_reports_v2(
  p_range text default '30d',
  p_status text default null,
  p_customer text default null,
  p_route text default null,
  p_page integer default 1,
  p_page_size integer default 50
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
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_customer text := nullif(btrim(coalesce(p_customer, '')), '');
  v_route text := nullif(btrim(coalesce(p_route, '')), '');
  v_requested_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := case when p_page_size = 100 then 100 else 50 end;
  v_total bigint := 0;
  v_total_pages integer := 1;
  v_page integer := 1;
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

  if v_status is not null
     and v_status <> 'all'
     and v_status not in ('quoted', 'placed', 'accepted', 'in_transit', 'delivered', 'cancelled') then
    raise exception 'Unsupported order status: %', v_status using errcode = '22023';
  end if;

  select count(*)::bigint
    into v_total
  from public.orders o
  where (v_start is null or o.created_at >= v_start)
    and (v_status is null or v_status = 'all' or o.status::text = v_status)
    and (
      v_customer is null
      or coalesce(o.customer_name, '') ilike '%' || v_customer || '%'
      or coalesce(o.customer_phone, '') ilike '%' || v_customer || '%'
    )
    and (
      v_route is null
      or coalesce(o.pickup_address, '') ilike '%' || v_route || '%'
      or coalesce(o.dropoff_address, '') ilike '%' || v_route || '%'
    );

  v_total_pages := greatest(1, ceil(v_total::numeric / v_page_size)::integer);
  v_page := least(v_requested_page, v_total_pages);

  with
  base_orders as materialized (
    select o.*
    from public.orders o
    where (v_start is null or o.created_at >= v_start)
      and (
        v_customer is null
        or coalesce(o.customer_name, '') ilike '%' || v_customer || '%'
        or coalesce(o.customer_phone, '') ilike '%' || v_customer || '%'
      )
      and (
        v_route is null
        or coalesce(o.pickup_address, '') ilike '%' || v_route || '%'
        or coalesce(o.dropoff_address, '') ilike '%' || v_route || '%'
      )
  ),
  filtered_orders as materialized (
    select o.*
    from base_orders o
    where v_status is null or v_status = 'all' or o.status::text = v_status
  ),
  payment_order_scope as materialized (
    select o.id
    from public.orders o
    where (v_status is null or v_status = 'all' or o.status::text = v_status)
      and (
        v_customer is null
        or coalesce(o.customer_name, '') ilike '%' || v_customer || '%'
        or coalesce(o.customer_phone, '') ilike '%' || v_customer || '%'
      )
      and (
        v_route is null
        or coalesce(o.pickup_address, '') ilike '%' || v_route || '%'
        or coalesce(o.dropoff_address, '') ilike '%' || v_route || '%'
      )
  ),
  range_payments as materialized (
    select p.*
    from public.payments p
    join payment_order_scope o on o.id = p.order_id
    where v_start is null or p.created_at >= v_start
  ),
  page_rows as (
    select
      o.id,
      o.tracking_id,
      o.customer_name,
      o.customer_phone,
      o.pickup_address,
      o.dropoff_address,
      o.vehicle_type,
      o.price_etb,
      o.status::text as status,
      o.payment_status::text as payment_status,
      o.driver_id,
      o.truck_id,
      o.created_at,
      o.delivered_at
    from filtered_orders o
    order by o.created_at desc, o.id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ),
  order_stats as (
    select
      count(*)::bigint as total_orders,
      count(*) filter (where status = 'delivered')::bigint as delivered_orders,
      count(*) filter (where status in ('accepted', 'in_transit'))::bigint as active_shipments,
      count(*) filter (where status = 'placed')::bigint as waiting_assignment,
      coalesce(sum(greatest(coalesce(price_etb, 0), 0)), 0)::numeric as invoice_etb
    from filtered_orders
  ),
  payment_stats as (
    select
      coalesce(sum(greatest(coalesce(amount_etb, 0), 0)) filter (where event = 'released'), 0)::numeric as released_gross_etb,
      coalesce(sum(greatest(coalesce(amount_etb, 0), 0)) filter (where event = 'refunded'), 0)::numeric as refunded_etb,
      coalesce(sum(greatest(coalesce(amount_etb, 0), 0)) filter (where event = 'held_escrow'), 0)::numeric as held_escrow_etb,
      coalesce(sum(greatest(coalesce(amount_etb, 0), 0)) filter (where event = 'initiated'), 0)::numeric as initiated_etb,
      count(*) filter (where event = 'initiated')::bigint as payments_needing_verification
    from range_payments
  ),
  fleet_stats as (
    select
      count(*)::bigint as total_trucks,
      count(*) filter (where status = 'available')::bigint as available_trucks,
      count(*) filter (where status = 'assigned')::bigint as assigned_trucks
    from public.trucks
  ),
  driver_stats as (
    select
      count(*)::bigint as total_drivers,
      count(*) filter (where driver_status = 'approved')::bigint as approved_drivers
    from public.profiles
    where role = 'driver'
  ),
  customer_stats as (
    select count(*)::bigint as total_customers from public.customers
  ),
  status_counts as (
    select
      jsonb_build_object('all', (select count(*)::bigint from base_orders))
      || coalesce(jsonb_object_agg(x.status, x.count), '{}'::jsonb) as value
    from (
      select status::text as status, count(*)::bigint as count
      from base_orders
      group by status
    ) x
  ),
  top_routes as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.orders desc, x.invoice_etb desc, x.route), '[]'::jsonb) as value
    from (
      select
        concat(o.pickup_address, ' → ', o.dropoff_address) as route,
        count(*)::bigint as orders,
        count(*) filter (where o.status = 'delivered')::bigint as delivered,
        coalesce(sum(greatest(coalesce(o.price_etb, 0), 0)), 0)::numeric as invoice_etb
      from filtered_orders o
      group by o.pickup_address, o.dropoff_address
      order by count(*) desc, coalesce(sum(greatest(coalesce(o.price_etb, 0), 0)), 0) desc
      limit 8
    ) x
  ),
  top_customers as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.orders desc, x.invoice_etb desc, x.customer), '[]'::jsonb) as value
    from (
      select
        coalesce(nullif(o.customer_name, ''), 'Unknown customer') as customer,
        max(o.customer_phone) as phone,
        count(*)::bigint as orders,
        count(*) filter (where o.status = 'delivered')::bigint as delivered,
        coalesce(sum(greatest(coalesce(o.price_etb, 0), 0)), 0)::numeric as invoice_etb
      from filtered_orders o
      group by coalesce(nullif(o.customer_name, ''), 'Unknown customer')
      order by count(*) desc, coalesce(sum(greatest(coalesce(o.price_etb, 0), 0)), 0) desc
      limit 8
    ) x
  )
  select jsonb_build_object(
    'range', p_range,
    'generatedAt', v_now,
    'filters', jsonb_build_object(
      'status', coalesce(v_status, 'all'),
      'customer', coalesce(v_customer, ''),
      'route', coalesce(v_route, '')
    ),
    'summary', jsonb_build_object(
      'totalOrders', os.total_orders,
      'deliveredOrders', os.delivered_orders,
      'activeShipments', os.active_shipments,
      'waitingAssignment', os.waiting_assignment,
      'invoiceEtb', os.invoice_etb,
      'totalTrucks', fs.total_trucks,
      'availableTrucks', fs.available_trucks,
      'assignedTrucks', fs.assigned_trucks,
      'totalDrivers', ds.total_drivers,
      'approvedDrivers', ds.approved_drivers,
      'totalCustomers', cs.total_customers,
      'releasedGrossEtb', ps.released_gross_etb,
      'refundedEtb', ps.refunded_etb,
      'heldEscrowEtb', ps.held_escrow_etb,
      'initiatedEtb', ps.initiated_etb,
      'paymentsNeedingVerification', ps.payments_needing_verification
    ),
    'statusCounts', sc.value,
    'topRoutes', tr.value,
    'topCustomers', tc.value,
    'page', jsonb_build_object(
      'page', v_page,
      'pageSize', v_page_size,
      'total', v_total,
      'totalPages', v_total_pages,
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from page_rows r), '[]'::jsonb)
    )
  ) into v_result
  from order_stats os
  cross join payment_stats ps
  cross join fleet_stats fs
  cross join driver_stats ds
  cross join customer_stats cs
  cross join status_counts sc
  cross join top_routes tr
  cross join top_customers tc;

  return v_result;
end;
$$;

revoke all on function public.admin_reports_v2(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_reports_v2(text, text, text, text, integer, integer) to authenticated;

commit;
