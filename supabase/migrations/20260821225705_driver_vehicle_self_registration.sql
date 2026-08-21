-- Let an authenticated driver register the vehicle that will be reviewed with
-- the existing private verification-document workflow. Existing driver and
-- document approval states are intentionally left unchanged.

create or replace function public.driver_save_vehicle_profile(
  p_plate_number text,
  p_vehicle_type text,
  p_capacity_tons numeric
)
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
  v_driver_id uuid := auth.uid();
  v_driver_status text;
  v_truck_id uuid;
  v_plate_number text := upper(btrim(regexp_replace(coalesce(p_plate_number, ''), '[[:space:]]+', ' ', 'g')));
  v_vehicle_type text;
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in is required.' using errcode = '28000';
  end if;

  select p.driver_status::text
  into v_driver_status
  from public.profiles p
  where p.id = v_driver_id
    and p.role::text = 'driver';

  if not found then
    raise exception 'Driver profile not found.' using errcode = 'P0002';
  end if;

  if v_driver_status = 'suspended' then
    raise exception 'This driver profile is suspended.' using errcode = '42501';
  end if;

  if char_length(v_plate_number) < 3 or char_length(v_plate_number) > 32 then
    raise exception 'Enter a valid plate number.' using errcode = '22023';
  end if;

  v_vehicle_type := case lower(btrim(coalesce(p_vehicle_type, '')))
    when 'pickup' then 'Pickup'
    when 'van' then 'Van'
    when 'isuzu 5 ton' then 'Isuzu 5 Ton'
    when 'dry cargo' then 'Dry Cargo'
    when 'refrigerated' then 'Refrigerated'
    when 'truck 22 ton' then 'Truck 22 Ton'
    when 'truck 25 ton' then 'Truck 25 Ton'
    when 'truck 30 ton' then 'Truck 30 Ton'
    when 'trailer' then 'Trailer'
    else null
  end;

  if v_vehicle_type is null then
    raise exception 'Choose a valid vehicle type.' using errcode = '22023';
  end if;

  if p_capacity_tons is null or p_capacity_tons < 0.1 or p_capacity_tons > 60 then
    raise exception 'Vehicle capacity must be between 0.1 and 60 tons.' using errcode = '22023';
  end if;

  select t.id
  into v_truck_id
  from public.trucks t
  where t.driver_id = v_driver_id
  order by t.updated_at desc
  limit 1
  for update;

  if v_truck_id is null then
    if exists (
      select 1
      from public.trucks existing_truck
      where upper(btrim(existing_truck.plate_number)) = v_plate_number
    ) then
      raise exception 'This plate number is already registered. Contact HALLOTRUCK Admin.' using errcode = '23505';
    end if;

    insert into public.trucks (
      plate_number,
      vehicle_type,
      capacity_tons,
      status,
      driver_id,
      created_by,
      updated_at
    ) values (
      v_plate_number,
      v_vehicle_type,
      p_capacity_tons,
      'inactive',
      v_driver_id,
      v_driver_id,
      now()
    )
    returning trucks.id into v_truck_id;
  else
    if exists (
      select 1
      from public.orders active_order
      where active_order.truck_id = v_truck_id
        and active_order.driver_id = v_driver_id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    ) then
      raise exception 'Vehicle details cannot change during an active trip.' using errcode = '55000';
    end if;

    if exists (
      select 1
      from public.trucks existing_truck
      where upper(btrim(existing_truck.plate_number)) = v_plate_number
        and existing_truck.id <> v_truck_id
    ) then
      raise exception 'This plate number is already registered. Contact HALLOTRUCK Admin.' using errcode = '23505';
    end if;

    update public.trucks t
    set
      plate_number = v_plate_number,
      vehicle_type = v_vehicle_type,
      capacity_tons = p_capacity_tons,
      updated_at = now()
    where t.id = v_truck_id;
  end if;

  return query
  select t.id, t.plate_number, t.vehicle_type, t.capacity_tons, t.status
  from public.trucks t
  where t.id = v_truck_id;
end;
$$;

revoke all on function public.driver_save_vehicle_profile(text, text, numeric) from public, anon;
grant execute on function public.driver_save_vehicle_profile(text, text, numeric) to authenticated;

-- Approval is one transaction: all identity and vehicle evidence must already
-- be verified, then the linked self-registered vehicle becomes operational.
create or replace function public.admin_approve_driver_onboarding(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_truck_id uuid;
begin
  if v_actor_role not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_driver_id
      and p.role::text = 'driver'
      and p.driver_status::text <> 'suspended'
  ) then
    raise exception 'Active driver profile not found.' using errcode = 'P0002';
  end if;

  select t.id
  into v_truck_id
  from public.trucks t
  where t.driver_id = p_driver_id
  order by t.updated_at desc
  limit 1
  for update;

  if v_truck_id is null then
    raise exception 'Driver vehicle details are required before approval.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(array[
      'driver_photo',
      'license_front',
      'license_back',
      'national_id_front',
      'national_id_back'
    ]::text[]) required_key
    where not exists (
      select 1
      from public.driver_verification_files vf
      where vf.driver_id = p_driver_id
        and vf.truck_id is null
        and vf.document_key = required_key
        and vf.status = 'verified'
        and (vf.expiry_date is null or vf.expiry_date >= current_date)
    )
  ) then
    raise exception 'Verify all five driver identity documents before approval.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(array[
      'vehicle_registration',
      'insurance',
      'transport_permit',
      'truck_front',
      'truck_back',
      'truck_side',
      'truck_loading_area'
    ]::text[]) required_key
    where not exists (
      select 1
      from public.driver_verification_files vf
      where vf.driver_id = p_driver_id
        and vf.truck_id = v_truck_id
        and vf.document_key = required_key
        and vf.status = 'verified'
        and (vf.expiry_date is null or vf.expiry_date >= current_date)
    )
  ) then
    raise exception 'Verify all seven vehicle documents and photos before approval.' using errcode = '23514';
  end if;

  update public.profiles p
  set driver_status = 'approved'::public.driver_status
  where p.id = p_driver_id;

  update public.trucks t
  set
    status = case when t.status = 'inactive' then 'available' else t.status end,
    updated_at = now()
  where t.id = v_truck_id;
end;
$$;

revoke all on function public.admin_approve_driver_onboarding(uuid) from public, anon;
grant execute on function public.admin_approve_driver_onboarding(uuid) to authenticated;

-- Verification uploads may reference only a vehicle owned by the current
-- driver or a fleet vehicle already linked to one of that driver's trips.
drop policy if exists "driver verification own insert" on public.driver_verification_files;
create policy "driver verification own insert"
  on public.driver_verification_files
  for insert
  to authenticated
  with check (
    driver_id = (select auth.uid())
    and (
      truck_id is null
      or exists (
        select 1
        from public.trucks t
        where t.id = driver_verification_files.truck_id
          and t.driver_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.orders o
        where o.truck_id = driver_verification_files.truck_id
          and o.driver_id = (select auth.uid())
      )
    )
  );

drop policy if exists "driver verification own update" on public.driver_verification_files;
create policy "driver verification own update"
  on public.driver_verification_files
  for update
  to authenticated
  using (driver_id = (select auth.uid()))
  with check (
    driver_id = (select auth.uid())
    and status = 'pending'
    and (
      truck_id is null
      or exists (
        select 1
        from public.trucks t
        where t.id = driver_verification_files.truck_id
          and t.driver_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.orders o
        where o.truck_id = driver_verification_files.truck_id
          and o.driver_id = (select auth.uid())
      )
    )
  );

notify pgrst, 'reload schema';
