create or replace function public.complete_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  assigned_truck_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select o.truck_id
    into assigned_truck_id
  from public.orders o
  where o.id = p_order_id
    and o.driver_id = current_user_id
    and o.status = 'in_transit'::public.order_status
  for update;

  if not found then
    return false;
  end if;

  update public.orders
  set
    status = 'delivered'::public.order_status,
    delivered_at = now()
  where id = p_order_id;

  if assigned_truck_id is not null then
    update public.trucks
    set
      status = 'available',
      driver_id = null,
      updated_at = now()
    where id = assigned_truck_id;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_order(uuid) from public, anon;
grant execute on function public.complete_order(uuid) to authenticated;
