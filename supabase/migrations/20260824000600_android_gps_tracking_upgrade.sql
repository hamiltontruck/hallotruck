alter table public.tracking_pings
  add column if not exists accuracy_m numeric,
  add column if not exists source_recorded_at timestamptz,
  add column if not exists android_device_id text;

alter table public.tracking_pings
  drop constraint if exists tracking_pings_accuracy_m_check,
  drop constraint if exists tracking_pings_heading_check,
  drop constraint if exists tracking_pings_speed_kmh_check;

alter table public.tracking_pings
  add constraint tracking_pings_accuracy_m_check
    check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 5000)),
  add constraint tracking_pings_heading_check
    check (heading is null or (heading >= 0 and heading < 360)),
  add constraint tracking_pings_speed_kmh_check
    check (speed_kmh is null or (speed_kmh >= 0 and speed_kmh <= 250));

create index if not exists tracking_pings_recorded_brin
  on public.tracking_pings using brin(recorded_at);

create index if not exists tracking_pings_driver_recorded_idx
  on public.tracking_pings(driver_id, recorded_at desc);

create or replace function public.record_driver_tracking_ping(
  p_driver_id uuid,
  p_order_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_heading numeric default null,
  p_speed_kmh numeric default null,
  p_accuracy_m numeric default null,
  p_source_recorded_at timestamptz default null,
  p_android_device_id text default null
)
returns table(ping_id bigint, inserted boolean, recorded_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_order_status public.order_status;
  v_order_driver uuid;
  v_source_time timestamptz := coalesce(p_source_recorded_at, now());
  v_device_id text := nullif(btrim(coalesce(p_android_device_id, '')), '');
  v_latest_id bigint;
  v_latest_location public.geography;
  v_latest_time timestamptz;
  v_new_location public.geography;
  v_id bigint;
  v_recorded_at timestamptz;
begin
  if v_role <> 'service_role' and auth.uid() is distinct from p_driver_id then
    raise exception 'Tracking can only be recorded for the signed-in driver' using errcode = '42501';
  end if;

  if p_lng is null or p_lng < -180 or p_lng > 180
     or p_lat is null or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid GPS coordinates' using errcode = '22023';
  end if;

  if p_heading is not null and (p_heading < 0 or p_heading >= 360) then
    raise exception 'Heading must be between 0 and 359.999 degrees' using errcode = '22023';
  end if;

  if p_speed_kmh is not null and (p_speed_kmh < 0 or p_speed_kmh > 250) then
    raise exception 'Speed must be between 0 and 250 km/h' using errcode = '22023';
  end if;

  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 5000) then
    raise exception 'GPS accuracy is outside the accepted range' using errcode = '22023';
  end if;

  if v_source_time > now() + interval '5 minutes'
     or v_source_time < now() - interval '24 hours' then
    raise exception 'GPS timestamp is outside the accepted time window' using errcode = '22023';
  end if;

  select o.status, o.driver_id
  into v_order_status, v_order_driver
  from public.orders o
  where o.id = p_order_id;

  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order_driver is distinct from p_driver_id then
    raise exception 'Driver is not assigned to this order' using errcode = '42501';
  end if;
  if v_order_status not in ('accepted'::public.order_status, 'in_transit'::public.order_status) then
    raise exception 'This order is not active for live tracking' using errcode = '23514';
  end if;

  if v_device_id is not null and not exists (
    select 1 from public.mobile_devices d
    where d.user_id = p_driver_id
      and d.android_device_id = v_device_id
      and d.is_active = true
  ) then
    raise exception 'Android device is not registered for this driver' using errcode = '42501';
  end if;

  v_new_location := public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography;

  select tp.id, tp.location, tp.recorded_at
  into v_latest_id, v_latest_location, v_latest_time
  from public.tracking_pings tp
  where tp.order_id = p_order_id and tp.driver_id = p_driver_id
  order by tp.recorded_at desc
  limit 1;

  if v_latest_id is not null
     and v_latest_time >= now() - interval '5 seconds'
     and public.st_distance(v_latest_location, v_new_location) < 10 then
    return query select v_latest_id, false, v_latest_time;
    return;
  end if;

  insert into public.tracking_pings(
    order_id, driver_id, location, heading, speed_kmh,
    accuracy_m, source_recorded_at, android_device_id
  ) values (
    p_order_id, p_driver_id, v_new_location, p_heading, p_speed_kmh,
    p_accuracy_m, v_source_time, v_device_id
  )
  returning id, public.tracking_pings.recorded_at into v_id, v_recorded_at;

  if v_order_status = 'accepted'::public.order_status then
    update public.orders
    set status = 'in_transit'::public.order_status
    where id = p_order_id and status = 'accepted'::public.order_status;
  end if;

  return query select v_id, true, v_recorded_at;
end;
$$;

revoke all on function public.record_driver_tracking_ping(uuid,uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.record_driver_tracking_ping(uuid,uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text)
  to service_role;

create or replace function public.cleanup_tracking_pings(p_retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_days integer := greatest(7, least(coalesce(p_retention_days, 30), 365));
begin
  delete from public.tracking_pings
  where recorded_at < now() - make_interval(days => v_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cleanup_tracking_pings(integer) from public, anon, authenticated;
revoke insert, update, delete on public.tracking_pings from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tracking_pings'
  ) then
    alter publication supabase_realtime add table public.tracking_pings;
  end if;
end;
$$;

select cron.schedule(
  'hallotruck-tracking-retention',
  '30 2 * * *',
  $$select public.cleanup_tracking_pings(30);$$
);