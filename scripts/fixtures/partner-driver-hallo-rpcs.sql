-- Read-only production snapshot of existing HALLO RPC bodies, before workspace guards.
CREATE OR REPLACE FUNCTION public.driver_save_vehicle_profile(p_plate_number text, p_vehicle_type text, p_capacity_tons numeric, p_model text)
 RETURNS TABLE(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_driver_id uuid := auth.uid();
  v_driver_status text;
  v_truck_id uuid;
  v_plate_number text := upper(btrim(regexp_replace(coalesce(p_plate_number, ''), '[[:space:]]+', ' ', 'g')));
  v_vehicle_type text;
  v_model text := nullif(btrim(regexp_replace(coalesce(p_model, ''), '[[:space:]]+', ' ', 'g')), '');
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in is required.' using errcode = '28000';
  end if;

  select p.driver_status::text
  into v_driver_status
  from public.profiles p
  where p.id = v_driver_id
    and p.role::text = 'driver';

  if not found then
    raise exception 'Driver profile not found.' using errcode = 'P0002';
  end if;

  if v_driver_status = 'suspended' then
    raise exception 'This driver profile is suspended.' using errcode = '42501';
  end if;

  if v_driver_status = 'approved' then
    raise exception 'Approved vehicle details are locked. Contact HALLOTRUCK Admin to change the plate, type, model or capacity.'
      using errcode = '42501';
  end if;

  if char_length(v_plate_number) < 3 or char_length(v_plate_number) > 32 then
    raise exception 'Enter a valid plate number.' using errcode = '22023';
  end if;

  if char_length(coalesce(v_model, '')) > 120 then
    raise exception 'Truck model must contain at most 120 characters.' using errcode = '22023';
  end if;

  v_vehicle_type := case lower(btrim(coalesce(p_vehicle_type, '')))
    when 'pickup' then 'Pickup'
    when 'van' then 'Van'
    when 'isuzu 5 ton' then 'Isuzu 5 Ton'
    when 'dry cargo' then 'Dry Cargo'
    when 'refrigerated' then 'Refrigerated'
    when 'truck 22 ton' then 'Truck 22 Ton'
    when 'truck 25 ton' then 'Truck 25 Ton'
    when 'truck 30 ton' then 'Truck 30 Ton'
    when 'trailer' then 'Trailer'
    else null
  end;

  if v_vehicle_type is null then
    raise exception 'Choose a valid vehicle type.' using errcode = '22023';
  end if;

  if p_capacity_tons is null or p_capacity_tons < 0.1 or p_capacity_tons > 60 then
    raise exception 'Vehicle capacity must be between 0.1 and 60 tons.' using errcode = '22023';
  end if;

  select t.id
  into v_truck_id
  from public.trucks t
  where t.driver_id = v_driver_id
  order by t.updated_at desc
  limit 1
  for update;

  if v_truck_id is null then
    if exists (
      select 1
      from public.trucks existing_truck
      where upper(btrim(existing_truck.plate_number)) = v_plate_number
    ) then
      raise exception 'This plate number is already registered. Contact HALLOTRUCK Admin.' using errcode = '23505';
    end if;

    insert into public.trucks (
      plate_number,
      vehicle_type,
      model,
      capacity_tons,
      status,
      driver_id,
      created_by,
      updated_at
    ) values (
      v_plate_number,
      v_vehicle_type,
      v_model,
      p_capacity_tons,
      'inactive',
      v_driver_id,
      v_driver_id,
      now()
    )
    returning trucks.id into v_truck_id;
  else
    if exists (
      select 1
      from public.orders active_order
      where active_order.truck_id = v_truck_id
        and active_order.driver_id = v_driver_id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    ) then
      raise exception 'Vehicle details cannot change during an active trip.' using errcode = '55000';
    end if;

    if exists (
      select 1
      from public.trucks existing_truck
      where upper(btrim(existing_truck.plate_number)) = v_plate_number
        and existing_truck.id <> v_truck_id
    ) then
      raise exception 'This plate number is already registered. Contact HALLOTRUCK Admin.' using errcode = '23505';
    end if;

    update public.trucks t
    set
      plate_number = v_plate_number,
      vehicle_type = v_vehicle_type,
      model = v_model,
      capacity_tons = p_capacity_tons,
      updated_at = now()
    where t.id = v_truck_id;
  end if;

  return query
  select t.id, t.plate_number, t.vehicle_type, t.capacity_tons, t.status
  from public.trucks t
  where t.id = v_truck_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.driver_save_vehicle_profile(p_plate_number text, p_vehicle_type text, p_capacity_tons numeric)
 RETURNS TABLE(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select *
  from public.driver_save_vehicle_profile(
    p_plate_number,
    p_vehicle_type,
    p_capacity_tons,
    coalesce((
      select t.model
      from public.trucks t
      where t.driver_id = auth.uid()
      order by t.updated_at desc
      limit 1
    ), '')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.admin_link_driver_onboarding_truck(p_driver_id uuid, p_truck_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_driver_status text;
  v_truck public.trucks%rowtype;
begin
  perform private.require_active_leadership('admin_link_driver_onboarding_truck');

  select p.driver_status::text into v_driver_status
  from public.profiles p
  where p.id = p_driver_id
    and p.role::text = 'driver'
    and p.driver_status::text <> 'suspended'
  for update;

  if not found then
    raise exception 'Active driver profile not found.' using errcode = 'P0002';
  end if;

  select * into v_truck
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Truck not found.' using errcode = 'P0002';
  end if;

  if v_truck.partner_id is not null then
    raise exception 'Partner fleet vehicles cannot be linked through driver onboarding.' using errcode = '23514';
  end if;

  if v_truck.driver_id is not null and v_truck.driver_id <> p_driver_id then
    raise exception 'Truck is already linked to another driver.' using errcode = '23514';
  end if;

  if v_truck.status in ('on_trip', 'maintenance', 'suspended') then
    raise exception 'Truck is not available for onboarding.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.orders o
    where o.truck_id = p_truck_id
      and o.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Truck has an active trip.' using errcode = '23514';
  end if;

  perform set_config('app.fleet_change_source', 'admin', true);
  perform set_config('app.fleet_change_reason', 'Driver onboarding vehicle link', true);

  update public.trucks
  set driver_id = p_driver_id,
      status = 'inactive',
      updated_at = now()
  where id = p_truck_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_order_with_truck(p_order_id uuid, p_truck_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
  truck_vehicle_type text;
  truck_capacity numeric;
  truck_status text;
  truck_driver_id uuid;
  truck_created_by uuid;
  target_driver_id uuid;
  target_truck_id uuid;
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

  select request.driver_id, request.truck_id
    into target_driver_id, target_truck_id
  from public.customer_dispatch_requests request
  where request.order_id = p_order_id
    and request.status = 'requested'
  limit 1;

  if target_driver_id is not null
     and (target_driver_id <> current_user_id or target_truck_id <> p_truck_id) then
    raise exception 'This customer requested a different driver or truck';
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  select t.vehicle_type, t.capacity_tons, t.status::text, t.driver_id, t.created_by
    into truck_vehicle_type, truck_capacity, truck_status, truck_driver_id, truck_created_by
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then raise exception 'Selected truck was not found'; end if;

  if not (
    truck_created_by = current_user_id
    or truck_driver_id = current_user_id
    or (target_driver_id = current_user_id and target_truck_id = p_truck_id)
  ) then
    raise exception 'Selected truck is not registered or requested for this driver';
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
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Selected truck is already on an active trip';
  end if;

  if not (
    (truck_status = 'available' and (truck_driver_id is null or truck_driver_id = current_user_id))
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
$function$
;
CREATE OR REPLACE FUNCTION public.claim_order_with_truck_v2(p_order_id uuid, p_truck_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Complete the current active trip before accepting another load';
  end if;
  return public.claim_order_with_truck_v2_calendar_unchecked_20260927(p_order_id, p_truck_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_order(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  selected_truck_id uuid;
  assigned_truck_id uuid;
  assigned_vehicle_type text;
  affected_rows integer;
  auto_reserved boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type into requested_vehicle_type from public.orders o
  where o.id=p_order_id and o.driver_id is null and o.status='placed'::public.order_status for update;
  if not found then return false; end if;
  if exists(select 1 from public.orders active_order where active_order.driver_id=current_user_id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  select t.id into selected_truck_id from public.trucks t
  where t.driver_id=current_user_id and t.status='assigned' and lower(btrim(t.vehicle_type))=lower(btrim(requested_vehicle_type))
  order by t.updated_at desc nulls last,t.created_at desc limit 1 for update;

  if selected_truck_id is null then
    select t.id,t.vehicle_type into assigned_truck_id,assigned_vehicle_type from public.trucks t
    where t.driver_id=current_user_id and t.status='assigned'
    order by t.updated_at desc nulls last,t.created_at desc limit 1 for update;
    if assigned_truck_id is not null then raise exception 'Your assigned % truck cannot take this % load',assigned_vehicle_type,requested_vehicle_type; end if;

    select t.id into selected_truck_id from public.trucks t
    where t.status='available' and t.driver_id is null and lower(btrim(t.vehicle_type))=lower(btrim(requested_vehicle_type))
      and not exists(select 1 from public.orders active_order where active_order.truck_id=t.id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status))
    order by t.updated_at asc nulls first,t.created_at asc limit 1 for update skip locked;
    if selected_truck_id is null then raise exception 'No available % truck is ready for this load',requested_vehicle_type; end if;
    update public.trucks set status='assigned',driver_id=current_user_id,updated_at=now() where id=selected_truck_id;
    auto_reserved:=true;
  end if;

  update public.orders set driver_id=current_user_id,truck_id=selected_truck_id,status='accepted'::public.order_status,accepted_at=now()
  where id=p_order_id and driver_id is null and status='placed'::public.order_status;
  get diagnostics affected_rows=row_count;
  if affected_rows<>1 then
    if auto_reserved then
      update public.trucks t set status='available',driver_id=null,updated_at=now()
      where t.id=selected_truck_id and t.driver_id=current_user_id
        and not exists(select 1 from public.orders active_order where active_order.truck_id=t.id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status));
    end if;
    return false;
  end if;
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.driver_available_trucks_for_order(p_order_id uuid)
 RETURNS TABLE(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
  target_driver_id uuid;
  target_truck_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;
  if not public.order_payment_ready_for_dispatch(p_order_id) then
    return;
  end if;

  select o.vehicle_type, o.cargo_weight_tons
    into requested_vehicle_type, requested_weight
  from public.orders o
  where o.id = p_order_id
    and o.status = 'placed'::public.order_status
    and o.driver_id is null;

  if requested_vehicle_type is null then return; end if;

  select request.driver_id, request.truck_id
    into target_driver_id, target_truck_id
  from public.customer_dispatch_requests request
  where request.order_id = p_order_id
    and request.status = 'requested'
  limit 1;

  if target_driver_id is not null and target_driver_id <> current_user_id then
    return;
  end if;

  return query
  select t.id, t.plate_number, t.vehicle_type, t.capacity_tons, t.status::text
  from public.trucks t
  where (
      t.created_by = current_user_id
      or t.driver_id = current_user_id
      or (target_driver_id = current_user_id and target_truck_id = t.id)
    )
    and (
      (t.status = 'available' and (t.driver_id is null or t.driver_id = current_user_id))
      or (t.status = 'assigned' and t.driver_id = current_user_id)
    )
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
    and (target_truck_id is null or t.id = target_truck_id)
  order by
    case when target_truck_id = t.id then 0 else 1 end,
    case when lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type)) then 0 else 1 end,
    t.capacity_tons asc nulls last,
    t.updated_at asc nulls first;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.driver_available_trucks_for_order_v2(p_order_id uuid)
 RETURNS TABLE(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    return;
  end if;
  return query select * from public.driver_available_trucks_for_order_v2_calendar_unchecked_20260927(p_order_id);
end;
$function$
;
