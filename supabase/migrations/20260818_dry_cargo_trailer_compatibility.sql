-- Allow a verified Trailer to fulfil a Dry Cargo order when no exact truck is ready.
-- Specialized loads remain exact-match only. Every entry point revalidates type,
-- capacity, documents, availability, and active-trip conflicts server-side.

create or replace function public.truck_type_can_fulfill(
  p_requested_type text,
  p_offered_type text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    lower(btrim(p_offered_type)) = lower(btrim(p_requested_type))
    or (
      lower(btrim(p_requested_type)) = 'dry cargo'
      and lower(btrim(p_offered_type)) = 'trailer'
    );
$$;

revoke all on function public.truck_type_can_fulfill(text, text) from public, anon;
grant execute on function public.truck_type_can_fulfill(text, text) to authenticated, service_role;

create or replace function public.dispatch_documents_valid(
  p_driver_id uuid,
  p_truck_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = p_driver_id
        and p.role::text = 'driver'
        and p.driver_status::text = 'approved'
    )
    and not exists (
      select 1
      from unnest(array[
        'driver_photo',
        'license_front',
        'license_back',
        'national_id_front',
        'national_id_back'
      ]::text[]) required_key
      where not exists (
        select 1
        from public.driver_verification_files vf
        where vf.driver_id = p_driver_id
          and vf.truck_id is null
          and vf.document_key = required_key
          and vf.status = 'verified'
          and (vf.expiry_date is null or vf.expiry_date >= current_date)
      )
    )
    and not exists (
      select 1
      from unnest(array[
        'vehicle_registration',
        'insurance',
        'transport_permit',
        'truck_front',
        'truck_back',
        'truck_side',
        'truck_loading_area'
      ]::text[]) required_key
      where not exists (
        select 1
        from public.driver_verification_files vf
        where vf.driver_id = p_driver_id
          and vf.truck_id = p_truck_id
          and vf.document_key = required_key
          and vf.status = 'verified'
          and (vf.expiry_date is null or vf.expiry_date >= current_date)
      )
    );
$$;

revoke all on function public.dispatch_documents_valid(uuid, uuid) from public, anon;
grant execute on function public.dispatch_documents_valid(uuid, uuid) to authenticated, service_role;

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
      ) as eta_minutes
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
  )
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
    ) as is_requested
  from ranked
  order by
    is_requested desc,
    case when lower(btrim(ranked.vehicle_type)) = lower(btrim((select vehicle_type from public.orders where id = p_order_id))) then 0 else 1 end,
    ranked.distance_km asc,
    ranked.capacity_tons asc nulls last,
    ranked.driver_name asc
  limit 12;
end;
$$;

revoke all on function public.customer_order_assignment_candidates(uuid) from public, anon;
grant execute on function public.customer_order_assignment_candidates(uuid) to authenticated;

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
declare
  v_role text := coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    ''
  );
begin
  if v_role not in ('admin', 'ceo', 'service_role') then
    raise exception 'Admin or CEO role required';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.status = 'placed'::public.order_status
      and o.driver_id is null
      and o.pickup is not null
  ) then
    raise exception 'A placed order with a valid pickup location is required';
  end if;

  return query
  with requested as (
    select o.pickup, o.vehicle_type, o.cargo_weight_tons
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
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
  has_assigned_compatible_truck boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type, o.cargo_weight_tons
    into requested_vehicle_type, requested_weight
  from public.orders o
  where o.id = p_order_id
    and o.status = 'placed'::public.order_status
    and o.driver_id is null;

  if requested_vehicle_type is null then return; end if;

  select exists (
    select 1
    from public.trucks t
    where t.driver_id = current_user_id
      and t.status in ('available', 'assigned')
      and public.truck_type_can_fulfill(requested_vehicle_type, t.vehicle_type)
      and (requested_weight is null or (t.capacity_tons is not null and t.capacity_tons >= requested_weight))
      and public.dispatch_documents_valid(current_user_id, t.id)
      and not exists (
        select 1
        from public.orders active_order
        where active_order.truck_id = t.id
          and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      )
  ) into has_assigned_compatible_truck;

  return query
  select t.id, t.plate_number, t.vehicle_type, t.capacity_tons, t.status::text
  from public.trucks t
  where public.truck_type_can_fulfill(requested_vehicle_type, t.vehicle_type)
    and (requested_weight is null or (t.capacity_tons is not null and t.capacity_tons >= requested_weight))
    and public.dispatch_documents_valid(current_user_id, t.id)
    and not exists (
      select 1
      from public.orders active_order
      where active_order.truck_id = t.id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    )
    and (
      (has_assigned_compatible_truck and t.driver_id = current_user_id and t.status in ('available', 'assigned'))
      or
      (not has_assigned_compatible_truck and t.status = 'available' and t.driver_id is null)
    )
  order by
    case when lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type)) then 0 else 1 end,
    t.capacity_tons asc nulls last,
    t.updated_at asc nulls first,
    t.created_at asc;
end;
$$;

revoke all on function public.driver_available_trucks_for_order(uuid) from public, anon;
grant execute on function public.driver_available_trucks_for_order(uuid) to authenticated;

create or replace function public.claim_order_with_truck(p_order_id uuid, p_truck_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
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

  if not found then return false; end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  select t.vehicle_type, t.capacity_tons, t.status::text, t.driver_id
    into truck_vehicle_type, truck_capacity, truck_status, truck_driver_id
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then raise exception 'Selected truck was not found'; end if;

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
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Selected truck is already on an active trip';
  end if;

  if not (
    (truck_status = 'available' and truck_driver_id is null)
    or (truck_status = 'assigned' and truck_driver_id = current_user_id)
  ) then
    raise exception 'Selected truck is no longer available';
  end if;

  update public.trucks
  set status = 'assigned', driver_id = current_user_id, updated_at = now()
  where id = p_truck_id;

  update public.orders
  set driver_id = current_user_id,
      truck_id = p_truck_id,
      status = 'accepted'::public.order_status,
      accepted_at = now()
  where id = p_order_id
    and driver_id is null
    and status = 'placed'::public.order_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then return false; end if;
  return true;
end;
$$;

revoke all on function public.claim_order_with_truck(uuid, uuid) from public, anon;
grant execute on function public.claim_order_with_truck(uuid, uuid) to authenticated;

create or replace function public.admin_assign_order(
  p_order_id uuid,
  p_truck_id uuid,
  p_driver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_truck uuid;
  v_order_status public.order_status;
  v_order_vehicle_type text;
  v_order_weight numeric;
  v_truck_vehicle_type text;
  v_truck_capacity numeric;
  v_truck_status text;
  v_truck_driver_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select o.truck_id, o.status, o.vehicle_type, o.cargo_weight_tons
    into v_old_truck, v_order_status, v_order_vehicle_type, v_order_weight
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order_status not in ('placed'::public.order_status, 'accepted'::public.order_status) then
    raise exception 'Only placed or accepted orders can be assigned';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_driver_id
      and p.role::text = 'driver'
      and p.driver_status::text = 'approved'
  ) then
    raise exception 'Select an approved driver';
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.id <> p_order_id
      and active_order.driver_id = p_driver_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Driver already has an active trip';
  end if;

  select t.vehicle_type, t.capacity_tons, t.status::text, t.driver_id
    into v_truck_vehicle_type, v_truck_capacity, v_truck_status, v_truck_driver_id
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then raise exception 'Truck was not found'; end if;

  if not (
    v_truck_status = 'available'
    or p_truck_id = v_old_truck
    or (v_truck_status = 'assigned' and v_truck_driver_id = p_driver_id)
  ) then
    raise exception 'Truck is not available';
  end if;

  if not public.truck_type_can_fulfill(v_order_vehicle_type, v_truck_vehicle_type) then
    raise exception 'Truck type % cannot fulfil order type %', v_truck_vehicle_type, v_order_vehicle_type;
  end if;

  if v_order_weight is not null
     and (v_truck_capacity is null or v_truck_capacity < v_order_weight) then
    raise exception 'Truck capacity is below the required % tons', v_order_weight;
  end if;

  if not public.dispatch_documents_valid(p_driver_id, p_truck_id) then
    raise exception 'Driver or truck documents are incomplete, expired, or not verified';
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.id <> p_order_id
      and active_order.truck_id = p_truck_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Truck already has an active trip';
  end if;

  if v_old_truck is not null and v_old_truck <> p_truck_id then
    update public.trucks
    set status = 'available', driver_id = null, updated_at = now()
    where id = v_old_truck;
  end if;

  update public.trucks
  set status = 'assigned', driver_id = p_driver_id, updated_at = now()
  where id = p_truck_id;

  update public.orders
  set truck_id = p_truck_id,
      driver_id = p_driver_id,
      status = 'accepted'::public.order_status,
      accepted_at = coalesce(accepted_at, now()),
      delivered_at = null
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_assign_order(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_assign_order(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
