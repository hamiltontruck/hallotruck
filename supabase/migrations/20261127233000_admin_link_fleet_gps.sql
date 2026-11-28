create unique index trucks_traccar_device_unique
  on public.trucks (btrim(gps_external_id))
  where gps_provider = 'traccar' and gps_external_id is not null;

create function public.admin_link_fleet_gps(p_plate_number text, p_imei text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imei text := pg_catalog.btrim(coalesce(p_imei, ''));
  v_plate text := private.normalize_fleet_plate(p_plate_number);
  v_truck public.trucks%rowtype;
begin
  if auth.uid() is null or not coalesce(private.is_admin_or_ceo(), false) then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  if v_imei !~ '^[0-9]{15}$' then
    raise exception 'Enter a 15-digit GPS IMEI';
  end if;

  select * into v_truck
  from public.trucks
  where plate_key = v_plate
  for update;

  if not found then
    raise exception 'No registered vehicle matches this plate';
  end if;

  if v_truck.gps_provider = 'traccar' and v_truck.gps_external_id = v_imei then
    return;
  end if;

  if v_truck.gps_provider is not null or v_truck.gps_external_id is not null then
    raise exception 'This vehicle already has a GPS device linked';
  end if;

  update public.trucks
  set gps_provider = 'traccar', gps_external_id = v_imei
  where id = v_truck.id;

  -- The enterprise truck trigger audits status/driver/profile fields, but does
  -- not include GPS columns. Record this privileged change in the same transaction.
  insert into public.fleet_audit_events (
    entity_type, entity_id, truck_id, partner_id, subject_driver_id,
    event_type, reason, old_values, new_values, actor_id, source
  ) values (
    'truck', v_truck.id, v_truck.id, v_truck.partner_id, v_truck.driver_id,
    'profile_updated', 'GPS device linked',
    jsonb_build_object('gps_provider', v_truck.gps_provider, 'gps_imei_last4', pg_catalog.right(v_truck.gps_external_id, 4)),
    jsonb_build_object('gps_provider', 'traccar', 'gps_imei_last4', pg_catalog.right(v_imei, 4)),
    auth.uid(), 'admin'
  );
exception when unique_violation then
  raise exception 'This GPS IMEI is already linked to another vehicle' using errcode = '23505';
end;
$$;

revoke all on function public.admin_link_fleet_gps(text, text) from public, anon;
grant execute on function public.admin_link_fleet_gps(text, text) to authenticated;
