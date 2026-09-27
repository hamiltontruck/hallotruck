-- Align Driver Mobile V2 claiming with the existing global unique indexes that
-- permit only one accepted/in-transit order per driver and truck at a time.
-- Keep the prior calendar-aware implementations private as compatibility
-- delegates; public callers go through the invariant-preserving wrappers.

alter function public.driver_can_view_available_order_v2(uuid,text,numeric)
  rename to driver_can_view_available_order_v2_calendar_unchecked_20260927;
alter function public.get_available_jobs_v2()
  rename to get_available_jobs_v2_calendar_unchecked_20260927;
alter function public.driver_available_trucks_for_order_v2(uuid)
  rename to driver_available_trucks_for_order_v2_calendar_unchecked_20260927;
alter function public.claim_order_with_truck_v2(uuid,uuid)
  rename to claim_order_with_truck_v2_calendar_unchecked_20260927;

revoke all on function public.driver_can_view_available_order_v2_calendar_unchecked_20260927(uuid,text,numeric) from public, anon, authenticated;
revoke all on function public.get_available_jobs_v2_calendar_unchecked_20260927() from public, anon, authenticated;
revoke all on function public.driver_available_trucks_for_order_v2_calendar_unchecked_20260927(uuid) from public, anon, authenticated;
revoke all on function public.claim_order_with_truck_v2_calendar_unchecked_20260927(uuid,uuid) from public, anon, authenticated;

create or replace function public.driver_can_view_available_order_v2(
  p_order_id uuid,
  p_vehicle_type text,
  p_cargo_weight_tons numeric
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1 from public.orders active_order
      where active_order.driver_id = auth.uid()
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    )
    and public.driver_can_view_available_order_v2_calendar_unchecked_20260927(
      p_order_id, p_vehicle_type, p_cargo_weight_tons
    );
$$;

create or replace function public.get_available_jobs_v2()
returns table(
  id uuid,
  tracking_id text,
  pickup_address text,
  dropoff_address text,
  vehicle_type text,
  distance_km numeric,
  price_etb numeric,
  cargo_description text,
  service_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = auth.uid()
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    return;
  end if;
  return query select * from public.get_available_jobs_v2_calendar_unchecked_20260927();
end;
$$;

create or replace function public.driver_available_trucks_for_order_v2(p_order_id uuid)
returns table(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    return;
  end if;
  return query select * from public.driver_available_trucks_for_order_v2_calendar_unchecked_20260927(p_order_id);
end;
$$;

create or replace function public.claim_order_with_truck_v2(p_order_id uuid, p_truck_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = current_user_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Complete the current active trip before accepting another load';
  end if;
  return public.claim_order_with_truck_v2_calendar_unchecked_20260927(p_order_id, p_truck_id);
end;
$$;

revoke all on function public.driver_can_view_available_order_v2(uuid,text,numeric) from public, anon;
revoke all on function public.get_available_jobs_v2() from public, anon;
revoke all on function public.driver_available_trucks_for_order_v2(uuid) from public, anon;
revoke all on function public.claim_order_with_truck_v2(uuid,uuid) from public, anon;
grant execute on function public.driver_can_view_available_order_v2(uuid,text,numeric) to authenticated, service_role;
grant execute on function public.get_available_jobs_v2() to authenticated, service_role;
grant execute on function public.driver_available_trucks_for_order_v2(uuid) to authenticated, service_role;
grant execute on function public.claim_order_with_truck_v2(uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
