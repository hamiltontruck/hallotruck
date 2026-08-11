-- Allow an approved driver to choose a compatible available truck before accepting a load.
-- Selection and claim are revalidated atomically server-side to prevent double-booking.

create or replace function public.driver_available_trucks_for_order(p_order_id uuid)
returns table (
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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_approved_driver() then
    raise exception 'Driver account is not approved';
  end if;

  select o.vehicle_type into requested_vehicle_type
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
  where lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type))
    and (
      (t.status = 'available' and t.driver_id is null)
      or (t.status = 'assigned' and t.driver_id = current_user_id)
    )
    and not exists (
      select 1 from public.orders active_order
      where active_order.truck_id = t.id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    )
  order by case when t.driver_id = current_user_id then 0 else 1 end,
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
  truck_vehicle_type text;
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

  select o.vehicle_type into requested_vehicle_type
  from public.orders o
  where o.id = p_order_id
    and o.driver_id is null
    and o.status = 'placed'::public.order_status
  for update;
  if not found then return false; end if;

  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  select t.vehicle_type, t.status::text, t.driver_id
    into truck_vehicle_type, truck_status, truck_driver_id
  from public.trucks t
  where t.id = p_truck_id
  for update;
  if not found then raise exception 'Selected truck was not found'; end if;

  if lower(btrim(truck_vehicle_type)) <> lower(btrim(requested_vehicle_type)) then
    raise exception 'Selected % truck cannot take this % load', truck_vehicle_type, requested_vehicle_type;
  end if;

  if exists (
    select 1 from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Selected truck is already on an active trip';
  end if;

  if not ((truck_status = 'available' and truck_driver_id is null)
          or (truck_status = 'assigned' and truck_driver_id = current_user_id)) then
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
  if affected_rows <> 1 then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.claim_order_with_truck(uuid, uuid) from public, anon;
grant execute on function public.claim_order_with_truck(uuid, uuid) to authenticated;
