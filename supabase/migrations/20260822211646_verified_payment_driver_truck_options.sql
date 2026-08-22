create or replace function public.driver_available_trucks_for_order(p_order_id uuid)
returns table(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
