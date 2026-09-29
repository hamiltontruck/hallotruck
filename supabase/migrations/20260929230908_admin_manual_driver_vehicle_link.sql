begin;

create or replace function public.admin_link_driver_onboarding_truck(
  p_driver_id uuid,
  p_truck_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.admin_link_driver_onboarding_truck(uuid, uuid) from public, anon;
grant execute on function public.admin_link_driver_onboarding_truck(uuid, uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
