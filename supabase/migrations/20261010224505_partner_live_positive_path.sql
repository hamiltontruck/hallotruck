begin;
set local lock_timeout = '5s';

create or replace function public.partner_get_live_trip(
  p_partner_id uuid,
  p_order_id uuid
)
returns table(
  order_id uuid,
  status public.order_status,
  pickup_lng double precision,
  pickup_lat double precision,
  dropoff_lng double precision,
  dropoff_lat double precision,
  truck_lng double precision,
  truck_lat double precision,
  heading numeric,
  speed_kmh numeric,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_postgis_schema text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.is_partner_member(p_partner_id) then
    raise exception 'Partner membership required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.partner_job_requests request
    join public.orders trip_order on trip_order.id = request.order_id
    join public.trucks trip_truck on trip_truck.id = trip_order.truck_id
    join public.partner_fleet_vehicles partner_vehicle
      on partner_vehicle.id = request.selected_partner_vehicle_id
    where request.partner_id = p_partner_id
      and request.order_id = p_order_id
      and request.status = 'confirmed'
      and trip_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      and trip_order.truck_id = request.selected_truck_id
      and trip_order.driver_id = request.selected_driver_id
      and trip_truck.partner_id = p_partner_id
      and partner_vehicle.partner_id = p_partner_id
      and partner_vehicle.truck_id = trip_order.truck_id
      and (
        partner_vehicle.assigned_driver_id is distinct from trip_order.driver_id
        or trip_truck.driver_id is distinct from trip_order.driver_id
      )
  ) then
    raise exception 'Partner live assignment mismatch: fleet and order drivers differ'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.partner_job_requests request
    join public.orders trip_order on trip_order.id = request.order_id
    join public.trucks trip_truck on trip_truck.id = trip_order.truck_id
    join public.partner_fleet_vehicles partner_vehicle
      on partner_vehicle.id = request.selected_partner_vehicle_id
    where request.partner_id = p_partner_id
      and request.order_id = p_order_id
      and request.status = 'confirmed'
      and trip_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      and trip_order.truck_id = request.selected_truck_id
      and trip_order.driver_id = request.selected_driver_id
      and trip_truck.partner_id = p_partner_id
      and trip_truck.driver_id = trip_order.driver_id
      and partner_vehicle.partner_id = p_partner_id
      and partner_vehicle.truck_id = trip_order.truck_id
      and partner_vehicle.assigned_driver_id = trip_order.driver_id
  ) then
    raise exception 'Active Partner trip not found' using errcode = '42501';
  end if;

  -- Read telemetry only after the Partner tenant and assignment checks above.
  -- The legacy Customer helper still checks Customer/Driver/Admin authorization.
  select namespace.nspname into v_postgis_schema
  from pg_catalog.pg_extension extension
  join pg_catalog.pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'postgis';
  if v_postgis_schema is null then
    raise exception 'PostGIS extension is required' using errcode = '55000';
  end if;

  return query execute pg_catalog.format(
    $sql$
      select trip_order.id, trip_order.status,
        %1$I.st_x(trip_order.pickup::%1$I.geometry),
        %1$I.st_y(trip_order.pickup::%1$I.geometry),
        %1$I.st_x(trip_order.dropoff::%1$I.geometry),
        %1$I.st_y(trip_order.dropoff::%1$I.geometry),
        %1$I.st_x(latest_ping.location::%1$I.geometry),
        %1$I.st_y(latest_ping.location::%1$I.geometry),
        latest_ping.heading, latest_ping.speed_kmh, latest_ping.recorded_at
      from public.orders trip_order
      left join lateral (
        select ping.location, ping.heading, ping.speed_kmh, ping.recorded_at
        from public.tracking_pings ping
        where ping.order_id = trip_order.id
        order by ping.recorded_at desc, ping.id desc
        limit 1
      ) latest_ping on true
      where trip_order.id = $1
    $sql$, v_postgis_schema
  ) using p_order_id;
end;
$function$;

commit;
