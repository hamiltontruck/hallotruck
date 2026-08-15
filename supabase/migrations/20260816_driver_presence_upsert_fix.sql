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

notify pgrst, 'reload schema';
