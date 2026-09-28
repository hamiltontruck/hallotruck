begin;

create or replace function public.admin_order_assignment_candidates(p_order_id uuid)
returns table(
  driver_id uuid,
  driver_name text,
  driver_phone text,
  truck_id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  distance_km numeric,
  location_accuracy_m numeric,
  presence_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_leadership('admin_order_assignment_candidates', true);

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.status = 'placed'::public.order_status
      and o.driver_id is null
      and o.pickup is not null
      and o.service_date is not null
  ) then
    raise exception 'A placed order with pickup and service date is required';
  end if;

  return query
  with requested as (
    select o.pickup, o.vehicle_type, o.cargo_weight_tons, o.service_date
    from public.orders o
    where o.id = p_order_id
  )
  select
    p.id as driver_id,
    p.full_name as driver_name,
    p.phone as driver_phone,
    best_truck.id as truck_id,
    best_truck.plate_number,
    best_truck.vehicle_type,
    best_truck.capacity_tons,
    round((public.st_distance(dp.location, requested.pickup) / 1000)::numeric, 1) as distance_km,
    dp.accuracy_m as location_accuracy_m,
    dp.updated_at as presence_updated_at
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
    select t.* from public.trucks t
    where public.truck_type_can_fulfill(requested.vehicle_type, t.vehicle_type)
      and (requested.cargo_weight_tons is null
        or (t.capacity_tons is not null and t.capacity_tons >= requested.cargo_weight_tons))
      and ((t.driver_id = p.id and t.status in ('available', 'assigned'))
        or (t.driver_id is null and t.status = 'available'))
      and not exists (
        select 1 from public.orders busy_order
        where busy_order.truck_id = t.id
          and busy_order.service_date = requested.service_date
          and busy_order.id <> p_order_id
      )
      and public.dispatch_documents_valid(p.id, t.id)
    order by
      case when lower(btrim(t.vehicle_type)) = lower(btrim(requested.vehicle_type)) then 0 else 1 end,
      case when t.driver_id = p.id then 0 else 1 end,
      t.capacity_tons asc nulls last, t.updated_at asc nulls first
    limit 1
  ) best_truck on true
  where not exists (
    select 1
    from public.orders busy_order
    where busy_order.driver_id = p.id
      and busy_order.service_date = requested.service_date
      and busy_order.id <> p_order_id
  )
  order by
    case when lower(btrim(best_truck.vehicle_type)) = lower(btrim(requested.vehicle_type)) then 0 else 1 end,
    public.st_distance(dp.location, requested.pickup) asc,
    best_truck.capacity_tons asc nulls last,
    p.full_name asc
  limit 20;
end;
$$;

revoke all on function public.admin_order_assignment_candidates(uuid) from public, anon;
grant execute on function public.admin_order_assignment_candidates(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
