create unique index if not exists orders_one_active_trip_per_driver
  on public.orders(driver_id)
  where driver_id is not null and status in ('accepted'::public.order_status,'in_transit'::public.order_status);

create unique index if not exists orders_one_active_trip_per_truck
  on public.orders(truck_id)
  where truck_id is not null and status in ('accepted'::public.order_status,'in_transit'::public.order_status);

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
  v_status public.order_status;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select truck_id,status into v_old_truck,v_status
  from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status not in ('placed'::public.order_status,'accepted'::public.order_status) then
    raise exception 'Only placed or accepted orders can be assigned';
  end if;

  if not exists(select 1 from public.profiles where id=p_driver_id and role='driver') then
    raise exception 'Driver profile not found';
  end if;

  if exists(
    select 1 from public.orders
    where driver_id=p_driver_id
      and id<>p_order_id
      and status in ('accepted'::public.order_status,'in_transit'::public.order_status)
  ) then
    raise exception 'Driver already has an active trip';
  end if;

  if exists(
    select 1 from public.orders
    where truck_id=p_truck_id
      and id<>p_order_id
      and status in ('accepted'::public.order_status,'in_transit'::public.order_status)
  ) then
    raise exception 'Truck already has an active trip';
  end if;

  if not exists(
    select 1 from public.trucks
    where id=p_truck_id and (status='available' or id=v_old_truck)
    for update
  ) then
    raise exception 'Truck is not available';
  end if;

  if v_old_truck is not null and v_old_truck<>p_truck_id then
    update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_old_truck;
  end if;

  update public.trucks set status='assigned',driver_id=p_driver_id,updated_at=now() where id=p_truck_id;
  update public.orders
  set truck_id=p_truck_id,driver_id=p_driver_id,status='accepted'::public.order_status,
      accepted_at=coalesce(accepted_at,now()),delivered_at=null
  where id=p_order_id;
end;
$$;

revoke all on function public.admin_assign_order(uuid,uuid,uuid) from public,anon;
grant execute on function public.admin_assign_order(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';