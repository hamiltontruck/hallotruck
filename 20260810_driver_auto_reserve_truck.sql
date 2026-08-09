-- Professional driver self-claim flow.
-- If the driver has no pre-assigned truck, reserve an available compatible truck
-- atomically when the load is accepted. A driver with an active trip cannot claim
-- another load. A pre-assigned truck must match the requested vehicle type.

create or replace function public.claim_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  selected_truck_id uuid;
  assigned_truck_id uuid;
  assigned_vehicle_type text;
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Driver account is not approved';
  end if;

  -- Lock the requested order first so only one driver can claim it.
  select o.vehicle_type
    into requested_vehicle_type
  from public.orders o
  where o.id = p_order_id
    and o.driver_id is null
    and o.status = 'placed'::public.order_status
  for update;

  if not found then
    return false;
  end if;

  -- A driver may operate only one active shipment at a time.
  if exists (
    select 1
    from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  -- Prefer a truck already assigned to this driver when it matches the load.
  select t.id
    into selected_truck_id
  from public.trucks t
  where t.driver_id = current_user_id
    and t.status = 'assigned'
    and lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type))
  order by t.updated_at desc nulls last, t.created_at desc
  limit 1
  for update;

  if selected_truck_id is null then
    -- If Admin already assigned a different truck type, do not silently switch it.
    select t.id, t.vehicle_type
      into assigned_truck_id, assigned_vehicle_type
    from public.trucks t
    where t.driver_id = current_user_id
      and t.status = 'assigned'
    order by t.updated_at desc nulls last, t.created_at desc
    limit 1
    for update;

    if assigned_truck_id is not null then
      raise exception 'Your assigned % truck cannot take this % load', assigned_vehicle_type, requested_vehicle_type;
    end if;

    -- No truck is currently assigned: atomically reserve a compatible available truck.
    select t.id
      into selected_truck_id
    from public.trucks t
    where t.status = 'available'
      and t.driver_id is null
      and lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type))
      and not exists (
        select 1
        from public.orders active_order
        where active_order.truck_id = t.id
          and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      )
    order by t.updated_at asc nulls first, t.created_at asc
    limit 1
    for update skip locked;

    if selected_truck_id is null then
      raise exception 'No available % truck is ready for this load', requested_vehicle_type;
    end if;

    update public.trucks
    set status = 'assigned',
        driver_id = current_user_id,
        updated_at = now()
    where id = selected_truck_id;
  end if;

  update public.orders
  set driver_id = current_user_id,
      truck_id = selected_truck_id,
      status = 'accepted'::public.order_status,
      accepted_at = now()
  where id = p_order_id
    and driver_id is null
    and status = 'placed'::public.order_status;

  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    -- Defensive cleanup only for a truck auto-reserved by this attempt and not used by an active trip.
    update public.trucks t
    set status = 'available',
        driver_id = null,
        updated_at = now()
    where t.id = selected_truck_id
      and t.driver_id = current_user_id
      and not exists (
        select 1
        from public.orders active_order
        where active_order.truck_id = t.id
          and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      );
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_order(uuid) from public, anon;
grant execute on function public.claim_order(uuid) to authenticated;
