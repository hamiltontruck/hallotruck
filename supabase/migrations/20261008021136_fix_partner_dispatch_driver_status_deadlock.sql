-- A truck with an approved driver but no active order is still available for
-- dispatch. The former assignment RPC changed the operational status to
-- "assigned", while Partner acceptance deliberately selects only available
-- trucks. That made the two required conditions mutually exclusive.
create or replace function public.admin_assign_fleet_driver(
  p_truck_id uuid,
  p_driver_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_active_trip boolean;
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Assignment reason is required';
  end if;
  if p_driver_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.id = p_driver_id
      and profile.role::text = 'driver'
      and profile.driver_status::text = 'approved'
  ) then
    raise exception 'Approved Driver account not found';
  end if;

  select exists (
    select 1
    from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.status in (
        'accepted'::public.order_status,
        'in_transit'::public.order_status
      )
  ) into v_has_active_trip;
  if v_has_active_trip then
    raise exception 'Driver assignment cannot change during an active trip';
  end if;
  if p_driver_id is not null and exists (
    select 1
    from public.trucks truck
    where truck.driver_id = p_driver_id
      and truck.id <> p_truck_id
      and truck.status not in ('maintenance', 'suspended', 'inactive')
  ) then
    raise exception 'Driver is already assigned to another active vehicle';
  end if;

  perform set_config('app.fleet_change_source', 'admin', true);
  perform set_config('app.fleet_change_reason', v_reason, true);
  update public.trucks
  set driver_id = p_driver_id,
      status = 'available',
      updated_at = now()
  where id = p_truck_id
    and status not in ('maintenance', 'suspended', 'inactive');
  if not found then
    raise exception 'Available fleet vehicle not found';
  end if;
end;
$$;

revoke all on function public.admin_assign_fleet_driver(uuid,uuid,text)
  from public, anon;
grant execute on function public.admin_assign_fleet_driver(uuid,uuid,text)
  to authenticated;

-- Repair Partner trucks put into the impossible pre-dispatch state by the old
-- RPC. Active orders are excluded so in-flight assignments are never changed.
select pg_catalog.set_config('app.fleet_change_source', 'system', true);
select pg_catalog.set_config(
  'app.fleet_change_reason',
  'Repair idle driver-bound Partner truck dispatch eligibility',
  true
);
update public.trucks truck
set status = 'available',
    updated_at = now()
where truck.partner_id is not null
  and truck.driver_id is not null
  and truck.status = 'assigned'
  and not exists (
    select 1
    from public.orders active_order
    where active_order.truck_id = truck.id
      and active_order.status in (
        'accepted'::public.order_status,
        'in_transit'::public.order_status
      )
  );

notify pgrst, 'reload schema';
