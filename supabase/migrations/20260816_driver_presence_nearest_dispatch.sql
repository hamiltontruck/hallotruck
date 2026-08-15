create table if not exists public.driver_presence (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  location public.geography(point, 4326),
  accuracy_m numeric,
  is_available boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint driver_presence_accuracy_check check (accuracy_m is null or accuracy_m >= 0)
);

create index if not exists driver_presence_location_gix
  on public.driver_presence using gist(location);
create index if not exists driver_presence_available_updated_idx
  on public.driver_presence(is_available, updated_at desc);

alter table public.driver_presence enable row level security;

drop policy if exists "driver presence participants read" on public.driver_presence;
create policy "driver presence participants read"
on public.driver_presence
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

create or replace function public.driver_set_presence(
  p_is_available boolean,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_m numeric default null
)
returns table(
  driver_id uuid,
  is_available boolean,
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
  v_location public.geography(point, 4326);
begin
  if v_driver_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_driver_id
      and p.role::text = 'driver'
      and p.driver_status::text = 'approved'
  ) then
    raise exception 'Approved driver account required';
  end if;

  if p_is_available then
    if p_lat is null or p_lng is null
       or p_lat < -90 or p_lat > 90
       or p_lng < -180 or p_lng > 180 then
      raise exception 'A valid GPS location is required to go online';
    end if;
    v_location := public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography;
  end if;

  insert into public.driver_presence as presence(
    driver_id,
    location,
    accuracy_m,
    is_available,
    updated_at
  ) values (
    v_driver_id,
    v_location,
    case when p_is_available then greatest(coalesce(p_accuracy_m, 0), 0) else null end,
    p_is_available,
    now()
  )
  on conflict on constraint driver_presence_pkey do update
  set location = case
        when excluded.is_available then excluded.location
        else presence.location
      end,
      accuracy_m = case
        when excluded.is_available then excluded.accuracy_m
        else presence.accuracy_m
      end,
      is_available = excluded.is_available,
      updated_at = now();

  return query
  select
    dp.driver_id,
    dp.is_available,
    case when dp.location is null then null else public.st_y(dp.location::public.geometry)::numeric end,
    case when dp.location is null then null else public.st_x(dp.location::public.geometry)::numeric end,
    dp.accuracy_m,
    dp.updated_at
  from public.driver_presence dp
  where dp.driver_id = v_driver_id;
end;
$$;

revoke all on function public.driver_set_presence(boolean, numeric, numeric, numeric) from public, anon;
grant execute on function public.driver_set_presence(boolean, numeric, numeric, numeric) to authenticated;

create or replace function public.admin_order_assignment_candidates(p_order_id uuid)
returns table(
  driver_id uuid,
  driver_name text,
  driver_phone text,
  truck_id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  distance_km numeric,
  location_accuracy_m numeric,
  presence_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    ''
  );
begin
  if v_role not in ('admin', 'ceo', 'service_role') then
    raise exception 'Admin or CEO role required';
  end if;

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.status = 'placed'::public.order_status
      and o.driver_id is null
      and o.pickup is not null
  ) then
    raise exception 'A placed order with a valid pickup location is required';
  end if;

  return query
  with requested as (
    select
      o.id,
      o.pickup,
      o.vehicle_type,
      o.cargo_weight_tons
    from public.orders o
    where o.id = p_order_id
  )
  select
    p.id as driver_id,
    p.full_name as driver_name,
    p.phone as driver_phone,
    best_truck.id as truck_id,
    best_truck.plate_number,
    best_truck.vehicle_type,
    best_truck.capacity_tons,
    round((public.st_distance(dp.location, requested.pickup) / 1000)::numeric, 1) as distance_km,
    dp.accuracy_m as location_accuracy_m,
    dp.updated_at as presence_updated_at
  from requested
  join public.driver_presence dp
    on dp.is_available = true
   and dp.location is not null
   and dp.updated_at >= now() - interval '30 minutes'
  join public.profiles p
    on p.id = dp.driver_id
   and p.role::text = 'driver'
   and p.driver_status::text = 'approved'
  join lateral (
    select t.*
    from public.trucks t
    where lower(btrim(t.vehicle_type)) = lower(btrim(requested.vehicle_type))
      and (requested.cargo_weight_tons is null or t.capacity_tons is null or t.capacity_tons >= requested.cargo_weight_tons)
      and (
        (t.driver_id = p.id and t.status in ('available', 'assigned'))
        or (t.driver_id is null and t.status = 'available')
      )
      and not exists (
        select 1
        from public.orders active_order
        where active_order.truck_id = t.id
          and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      )
      and not exists (
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
          where vf.driver_id = p.id
            and vf.truck_id = t.id
            and vf.document_key = required_key
            and vf.status = 'verified'
            and (vf.expiry_date is null or vf.expiry_date >= current_date)
        )
      )
    order by
      case when t.driver_id = p.id then 0 else 1 end,
      t.capacity_tons asc nulls last,
      t.updated_at asc nulls first
    limit 1
  ) best_truck on true
  where not exists (
    select 1
    from public.orders active_order
    where active_order.driver_id = p.id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  )
  and not exists (
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
      where vf.driver_id = p.id
        and vf.truck_id is null
        and vf.document_key = required_key
        and vf.status = 'verified'
        and (vf.expiry_date is null or vf.expiry_date >= current_date)
    )
  )
  order by
    public.st_distance(dp.location, requested.pickup) asc,
    best_truck.capacity_tons asc nulls last,
    p.full_name asc
  limit 20;
end;
$$;

revoke all on function public.admin_order_assignment_candidates(uuid) from public, anon;
grant execute on function public.admin_order_assignment_candidates(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
