-- Show drivers only loads that their own approved truck can fulfil.
-- The same ownership, type, capacity, document and active-trip checks are
-- enforced again when listing truck options and claiming the load.

create or replace function public.get_available_jobs()
returns table(
  id uuid,
  tracking_id text,
  pickup_address text,
  dropoff_address text,
  vehicle_type text,
  distance_km numeric,
  price_etb numeric,
  cargo_description text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Approved driver account required';
  end if;

  return query
  select
    o.id,
    o.tracking_id,
    o.pickup_address,
    o.dropoff_address,
    o.vehicle_type,
    o.distance_km,
    o.price_etb,
    o.cargo_description
  from public.orders o
  where o.status = 'placed'::public.order_status
    and o.driver_id is null
    and exists (
      select 1
      from public.trucks t
      where t.driver_id = current_user_id
        and t.status in ('available', 'assigned')
        and public.truck_type_can_fulfill(o.vehicle_type, t.vehicle_type)
        and (
          o.cargo_weight_tons is null
          or (t.capacity_tons is not null and t.capacity_tons >= o.cargo_weight_tons)
        )
        and public.dispatch_documents_valid(current_user_id, t.id)
        and not exists (
          select 1
          from public.orders active_order
          where active_order.truck_id = t.id
            and active_order.status in (
              'accepted'::public.order_status,
              'in_transit'::public.order_status
            )
        )
    )
  order by o.created_at asc;
end;
$function$;

create or replace function public.driver_available_trucks_for_order(p_order_id uuid)
returns table(
  id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Driver account is not approved';
  end if;

  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type, o.cargo_weight_tons
    into requested_vehicle_type, requested_weight
  from public.orders o
  where o.id = p_order_id
    and o.status = 'placed'::public.order_status
    and o.driver_id is null;

  if requested_vehicle_type is null then
    return;
  end if;

  return query
  select t.id, t.plate_number, t.vehicle_type, t.capacity_tons, t.status::text
  from public.trucks t
  where t.driver_id = current_user_id
    and t.status in ('available', 'assigned')
    and public.truck_type_can_fulfill(requested_vehicle_type, t.vehicle_type)
    and (
      requested_weight is null
      or (t.capacity_tons is not null and t.capacity_tons >= requested_weight)
    )
    and public.dispatch_documents_valid(current_user_id, t.id)
    and not exists (
      select 1
      from public.orders active_order
      where active_order.truck_id = t.id
        and active_order.status in (
          'accepted'::public.order_status,
          'in_transit'::public.order_status
        )
    )
  order by t.capacity_tons asc nulls last, t.updated_at asc nulls first, t.created_at asc;
end;
$function$;

create or replace function public.claim_order_with_truck(p_order_id uuid, p_truck_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
  truck_vehicle_type text;
  truck_capacity numeric;
  truck_status text;
  truck_driver_id uuid;
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Driver account is not approved';
  end if;

  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type, o.cargo_weight_tons
    into requested_vehicle_type, requested_weight
  from public.orders o
  where o.id = p_order_id
    and o.driver_id is null
    and o.status = 'placed'::public.order_status
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in (
        'accepted'::public.order_status,
        'in_transit'::public.order_status
      )
  ) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  select t.vehicle_type, t.capacity_tons, t.status::text, t.driver_id
    into truck_vehicle_type, truck_capacity, truck_status, truck_driver_id
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Selected truck was not found';
  end if;

  if truck_driver_id is distinct from current_user_id
     or truck_status not in ('available', 'assigned') then
    raise exception 'Use only your own available truck';
  end if;

  if not public.truck_type_can_fulfill(requested_vehicle_type, truck_vehicle_type) then
    raise exception 'Selected % truck cannot take this % load', truck_vehicle_type, requested_vehicle_type;
  end if;

  if requested_weight is not null
     and (truck_capacity is null or truck_capacity < requested_weight) then
    raise exception 'Selected truck capacity is below the required % tons', requested_weight;
  end if;

  if not public.dispatch_documents_valid(current_user_id, p_truck_id) then
    raise exception 'Driver or truck documents are incomplete, expired, or not verified';
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.status in (
        'accepted'::public.order_status,
        'in_transit'::public.order_status
      )
  ) then
    raise exception 'Selected truck is already on an active trip';
  end if;

  update public.trucks
  set status = 'assigned', updated_at = now()
  where id = p_truck_id
    and driver_id = current_user_id;

  update public.orders
  set driver_id = current_user_id,
      truck_id = p_truck_id,
      status = 'accepted'::public.order_status,
      accepted_at = now()
  where id = p_order_id
    and driver_id is null
    and status = 'placed'::public.order_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    return false;
  end if;

  return true;
end;
$function$;

grant execute on function public.get_available_jobs() to authenticated;
grant execute on function public.driver_available_trucks_for_order(uuid) to authenticated;
grant execute on function public.claim_order_with_truck(uuid, uuid) to authenticated;
revoke execute on function public.get_available_jobs() from anon, public;
revoke execute on function public.driver_available_trucks_for_order(uuid) from anon, public;
revoke execute on function public.claim_order_with_truck(uuid, uuid) from anon, public;

notify pgrst, 'reload schema';
