-- Harden Admin/CEO dispatch assignment.
-- This migration is intentionally not auto-applied to production.

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
  v_truck_vehicle_type text;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select o.truck_id, o.status, o.vehicle_type
    into v_old_truck, v_order_status, v_order_vehicle_type
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order_status <> 'placed'::public.order_status then
    raise exception 'Only a placed order can be assigned. Current status: %', v_order_status;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_driver_id
      and p.role = 'driver'
      and p.driver_status = 'approved'::public.driver_status
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
    raise exception 'This driver already has an active trip';
  end if;

  select t.vehicle_type
    into v_truck_vehicle_type
  from public.trucks t
  where t.id = p_truck_id
    and (t.status = 'available' or t.id = v_old_truck)
  for update;

  if not found then
    raise exception 'Truck is not available';
  end if;

  if lower(btrim(v_truck_vehicle_type)) <> lower(btrim(v_order_vehicle_type)) then
    raise exception 'Truck type % does not match order vehicle type %', v_truck_vehicle_type, v_order_vehicle_type;
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.id <> p_order_id
      and active_order.truck_id = p_truck_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'This truck is already assigned to an active trip';
  end if;

  if v_old_truck is not null and v_old_truck <> p_truck_id then
    update public.trucks
    set status = 'available',
        driver_id = null,
        updated_at = now()
    where id = v_old_truck;
  end if;

  update public.trucks
  set status = 'assigned',
      driver_id = p_driver_id,
      updated_at = now()
  where id = p_truck_id;

  update public.orders
  set truck_id = p_truck_id,
      driver_id = p_driver_id,
      status = 'accepted'::public.order_status,
      accepted_at = coalesce(accepted_at, now())
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_assign_order(uuid,uuid,uuid) from public, anon;
grant execute on function public.admin_assign_order(uuid,uuid,uuid) to authenticated;
