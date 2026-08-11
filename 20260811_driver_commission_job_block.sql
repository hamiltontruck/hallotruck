-- Prevent a driver with an unpaid approved commission balance from taking another load.
-- Pending settlement evidence does not unlock jobs; Admin/CEO approval must reduce the balance first.

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
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type into requested_vehicle_type
  from public.orders o
  where o.id = p_order_id and o.status = 'placed'::public.order_status and o.driver_id is null;
  if requested_vehicle_type is null then return; end if;

  return query
  select t.id,t.plate_number,t.vehicle_type,t.capacity_tons,t.status::text
  from public.trucks t
  where lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type))
    and ((t.status='available' and t.driver_id is null) or (t.status='assigned' and t.driver_id=current_user_id))
    and not exists (
      select 1 from public.orders active_order
      where active_order.truck_id=t.id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)
    )
  order by case when t.driver_id=current_user_id then 0 else 1 end,t.updated_at asc nulls first,t.created_at asc;
end;
$$;

create or replace function public.claim_order_with_truck(p_order_id uuid,p_truck_id uuid)
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
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type into requested_vehicle_type
  from public.orders o
  where o.id=p_order_id and o.driver_id is null and o.status='placed'::public.order_status
  for update;
  if not found then return false; end if;

  if exists(select 1 from public.orders active_order where active_order.driver_id=current_user_id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)) then
    raise exception 'Finish your active trip before accepting another load';
  end if;

  select t.vehicle_type,t.status::text,t.driver_id into truck_vehicle_type,truck_status,truck_driver_id
  from public.trucks t where t.id=p_truck_id for update;
  if not found then raise exception 'Selected truck was not found'; end if;
  if lower(btrim(truck_vehicle_type)) <> lower(btrim(requested_vehicle_type)) then
    raise exception 'Selected % truck cannot take this % load',truck_vehicle_type,requested_vehicle_type;
  end if;
  if exists(select 1 from public.orders active_order where active_order.truck_id=p_truck_id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)) then
    raise exception 'Selected truck is already on an active trip';
  end if;
  if not ((truck_status='available' and truck_driver_id is null) or (truck_status='assigned' and truck_driver_id=current_user_id)) then
    raise exception 'Selected truck is no longer available';
  end if;

  update public.trucks set status='assigned',driver_id=current_user_id,updated_at=now() where id=p_truck_id;
  update public.orders set driver_id=current_user_id,truck_id=p_truck_id,status='accepted'::public.order_status,accepted_at=now()
  where id=p_order_id and driver_id is null and status='placed'::public.order_status;
  get diagnostics affected_rows=row_count;
  if affected_rows<>1 then return false; end if;
  return true;
end;
$$;

-- Legacy claim path is also protected so commission debt cannot be bypassed.
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
$$;

revoke all on function public.driver_available_trucks_for_order(uuid) from public,anon;
revoke all on function public.claim_order_with_truck(uuid,uuid) from public,anon;
revoke all on function public.claim_order(uuid) from public,anon;
grant execute on function public.driver_available_trucks_for_order(uuid) to authenticated;
grant execute on function public.claim_order_with_truck(uuid,uuid) to authenticated;
grant execute on function public.claim_order(uuid) to authenticated;
notify pgrst,'reload schema';
