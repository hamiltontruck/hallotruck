-- Ensure driver self-claim attaches the driver's currently assigned truck to the order.
-- This keeps future invoices and trip records linked to the actual truck used.

create or replace function public.claim_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  assigned_truck_id uuid;
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Driver account is not approved';
  end if;

  select t.id
    into assigned_truck_id
  from public.trucks t
  where t.driver_id = current_user_id
    and t.status = 'assigned'
  order by t.updated_at desc nulls last, t.created_at desc
  limit 1;

  if assigned_truck_id is null then
    raise exception 'No assigned truck found for this driver';
  end if;

  update public.orders
  set
    driver_id = current_user_id,
    truck_id = assigned_truck_id,
    status = 'accepted'::public.order_status,
    accepted_at = now()
  where id = p_order_id
    and driver_id is null
    and status = 'placed'::public.order_status;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.claim_order(uuid) from public, anon;
grant execute on function public.claim_order(uuid) to authenticated;
