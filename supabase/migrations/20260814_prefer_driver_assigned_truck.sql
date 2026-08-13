create or replace function public.driver_available_trucks_for_order(p_order_id uuid)
returns table(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
language plpgsql security definer set search_path to ''
as $function$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  has_assigned_matching_truck boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then raise exception 'Commission settlement required before accepting another load'; end if;

  select o.vehicle_type into requested_vehicle_type
  from public.orders o
  where o.id=p_order_id and o.status='placed'::public.order_status and o.driver_id is null;
  if requested_vehicle_type is null then return; end if;

  select exists(
    select 1 from public.trucks t
    where t.driver_id=current_user_id
      and t.status in ('available','assigned')
      and lower(btrim(t.vehicle_type))=lower(btrim(requested_vehicle_type))
      and not exists(select 1 from public.orders o where o.truck_id=t.id and o.status in ('accepted'::public.order_status,'in_transit'::public.order_status))
  ) into has_assigned_matching_truck;

  return query
  select t.id,t.plate_number,t.vehicle_type,t.capacity_tons,t.status::text
  from public.trucks t
  where lower(btrim(t.vehicle_type))=lower(btrim(requested_vehicle_type))
    and not exists(select 1 from public.orders o where o.truck_id=t.id and o.status in ('accepted'::public.order_status,'in_transit'::public.order_status))
    and ((has_assigned_matching_truck and t.driver_id=current_user_id and t.status in ('available','assigned'))
      or (not has_assigned_matching_truck and t.status='available' and t.driver_id is null))
  order by t.updated_at asc nulls first,t.created_at asc;
end;
$function$;

grant execute on function public.driver_available_trucks_for_order(uuid) to authenticated;
revoke execute on function public.driver_available_trucks_for_order(uuid) from anon;
