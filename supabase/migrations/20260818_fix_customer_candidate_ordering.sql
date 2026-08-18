create or replace function public.customer_order_assignment_candidates(p_order_id uuid)
returns table(
  driver_id uuid,
  driver_name text,
  driver_rating numeric,
  completed_trips bigint,
  truck_id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  distance_km numeric,
  eta_minutes integer,
  is_requested boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
begin
  if v_customer_id is null then
    raise exception 'Customer sign-in required';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.customer_id = v_customer_id
      and o.status = 'placed'::public.order_status
      and o.driver_id is null
      and o.pickup is not null
  ) then
    raise exception 'A placed order that belongs to this customer is required';
  end if;

  return query
  with requested as (
    select o.pickup, o.vehicle_type, o.cargo_weight_tons
    from public.orders o
    where o.id = p_order_id
      and o.customer_id = v_customer_id
  ), ranked as (
    select
      p.id as driver_id,
      p.full_name as driver_name,
      (
        select round(avg(r.score)::numeric, 1)
        from public.ratings r
        where r.driver_id = p.id
      ) as driver_rating,
      (
        select count(*)
        from public.orders delivered_order
        where delivered_order.driver_id = p.id
          and delivered_order.status = 'delivered'::public.order_status
      ) as completed_trips,
      best_truck.id as truck_id,
      best_truck.plate_number,
      best_truck.vehicle_type,
      best_truck.capacity_tons,
      round((public.st_distance(dp.location, requested.pickup) / 1000)::numeric, 0) as distance_km,
      greatest(
        5,
        ceil(((public.st_distance(dp.location, requested.pickup) / 1000) / 35.0) * 60.0)::integer
      ) as eta_minutes,
      requested.vehicle_type as requested_vehicle_type
    from requested
    join public.driver_presence dp
      on dp.is_available = true
     and dp.location is not null
     and dp.updated_at >= now() - interval '30 minutes'
    join public.profiles p
      on p.id = dp.driver_id
     and p.role::text = 'driver'
     and p.driver_status::text = 'approved'
    join lateral (
      select t.*
      from public.trucks t
      where public.truck_type_can_fulfill(requested.vehicle_type, t.vehicle_type)
        and (
          requested.cargo_weight_tons is null
          or (t.capacity_tons is not null and t.capacity_tons >= requested.cargo_weight_tons)
        )
        and (
          (t.driver_id = p.id and t.status in ('available', 'assigned'))
          or (t.driver_id is null and t.status = 'available')
        )
        and not exists (
          select 1
          from public.orders active_order
          where active_order.truck_id = t.id
            and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
        )
        and public.dispatch_documents_valid(p.id, t.id)
      order by
        case when lower(btrim(t.vehicle_type)) = lower(btrim(requested.vehicle_type)) then 0 else 1 end,
        case when t.driver_id = p.id then 0 else 1 end,
        t.capacity_tons asc nulls last,
        t.updated_at asc nulls first
      limit 1
    ) best_truck on true
    where not exists (
      select 1
      from public.orders active_order
      where active_order.driver_id = p.id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    )
  ), results as (
    select
      ranked.driver_id,
      ranked.driver_name,
      ranked.driver_rating,
      ranked.completed_trips,
      ranked.truck_id,
      ranked.plate_number,
      ranked.vehicle_type,
      ranked.capacity_tons,
      ranked.distance_km,
      ranked.eta_minutes,
      exists (
        select 1
        from public.customer_dispatch_requests request
        where request.order_id = p_order_id
          and request.driver_id = ranked.driver_id
          and request.truck_id = ranked.truck_id
          and request.status = 'requested'
      ) as requested_flag,
      ranked.requested_vehicle_type
    from ranked
  )
  select
    results.driver_id,
    results.driver_name,
    results.driver_rating,
    results.completed_trips,
    results.truck_id,
    results.plate_number,
    results.vehicle_type,
    results.capacity_tons,
    results.distance_km,
    results.eta_minutes,
    results.requested_flag
  from results
  order by
    results.requested_flag desc,
    case when lower(btrim(results.vehicle_type)) = lower(btrim(results.requested_vehicle_type)) then 0 else 1 end,
    results.distance_km asc,
    results.capacity_tons asc nulls last,
    results.driver_name asc
  limit 12;
end;
$$;

revoke all on function public.customer_order_assignment_candidates(uuid) from public, anon;
grant execute on function public.customer_order_assignment_candidates(uuid) to authenticated;

notify pgrst, 'reload schema';
