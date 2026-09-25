begin;

alter table public.orders
  add column if not exists service_date date;

-- Preserve history exactly as-is while deriving a calendar day for legacy rows.
-- This does not rewrite order status, assignment, money, route or customer data.
update public.orders
set service_date = (created_at at time zone 'Africa/Addis_Ababa')::date
where service_date is null;

alter table public.orders
  alter column service_date set default ((now() at time zone 'Africa/Addis_Ababa')::date),
  alter column service_date set not null;

create index if not exists idx_orders_driver_service_date
  on public.orders(driver_id, service_date)
  where driver_id is not null;

create or replace function public.enforce_order_service_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.service_date < (now() at time zone 'Africa/Addis_Ababa')::date then
    raise exception 'Service date cannot be in the past' using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_service_date_guard on public.orders;
create trigger trg_orders_service_date_guard
before insert or update of service_date on public.orders
for each row execute function public.enforce_order_service_date();

create or replace function public.guard_driver_daily_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_driver uuid;
  v_day date;
  v_conflict uuid;
begin
  v_driver := new.driver_id;
  if v_driver is null then return new; end if;
  v_day := new.service_date;

  perform pg_advisory_xact_lock(hashtextextended(v_driver::text || ':' || v_day::text, 0));
  select o.id into v_conflict
  from public.orders o
  where o.driver_id = v_driver
    and o.service_date = v_day
    and o.id <> new.id
  limit 1;

  if v_conflict is not null then
    raise exception 'Driver already has an assignment for service date %', v_day
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_driver_daily_assignment on public.orders;
create trigger trg_orders_driver_daily_assignment
before insert or update of driver_id, service_date on public.orders
for each row execute function public.guard_driver_daily_assignment();

-- Existing marketplace eligibility stays authoritative; only the active-truck
-- conflict is scoped to the requested order's calendar date.
create or replace function public.driver_can_view_available_order(
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
  with target_order as (
    select o.service_date
    from public.orders o
    where o.id = p_order_id
  ),
  active_request as (
    select request.driver_id, request.truck_id
    from public.customer_dispatch_requests request
    where request.order_id = p_order_id
      and request.status = 'requested'
    limit 1
  )
  select
    auth.uid() is not null
    and public.is_approved_driver()
    and public.order_payment_ready_for_dispatch(p_order_id)
    and (
      not exists (select 1 from active_request)
      or exists (
        select 1 from active_request
        where active_request.driver_id = auth.uid()
      )
    )
    and exists (
      select 1
      from public.trucks t
      where (
          t.created_by = auth.uid()
          or t.driver_id = auth.uid()
        )
        and (
          (t.status = 'available' and (t.driver_id is null or t.driver_id = auth.uid()))
          or (t.status = 'assigned' and t.driver_id = auth.uid())
        )
        and public.truck_type_can_fulfill(p_vehicle_type, t.vehicle_type)
        and (
          p_cargo_weight_tons is null
          or (t.capacity_tons is not null and t.capacity_tons >= p_cargo_weight_tons)
        )
        and public.dispatch_documents_valid(auth.uid(), t.id)
        and not exists (
          select 1
          from public.orders active_order
          where active_order.truck_id = t.id
            and active_order.service_date = (select service_date from target_order)
            and active_order.status in (
              'accepted'::public.order_status,
              'in_transit'::public.order_status
            )
        )
        and (
          not exists (select 1 from active_request)
          or exists (
            select 1 from active_request
            where active_request.driver_id = auth.uid()
              and active_request.truck_id = t.id
          )
        )
    );
$$;

-- Calendar-aware extension of get_available_jobs. It delegates eligibility to
-- the existing authoritative RPC instead of copying marketplace rules.
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
language sql
stable
security definer
set search_path = ''
as $$
  select
    jobs.id,
    jobs.tracking_id,
    jobs.pickup_address,
    jobs.dropoff_address,
    jobs.vehicle_type,
    jobs.distance_km,
    jobs.price_etb,
    jobs.cargo_description,
    o.service_date
  from public.get_available_jobs() jobs
  join public.orders o on o.id = jobs.id
  order by o.service_date asc, jobs.tracking_id asc;
$$;
revoke all on function public.get_available_jobs_v2() from public, anon;
grant execute on function public.get_available_jobs_v2() to authenticated, service_role;

create or replace function public.driver_available_trucks_for_order(p_order_id uuid)
returns table(id uuid, plate_number text, vehicle_type text, capacity_tons numeric, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
  target_driver_id uuid;
  target_truck_id uuid;
  v_service_date date;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;
  if not public.order_payment_ready_for_dispatch(p_order_id) then
    return;
  end if;

  select o.vehicle_type, o.cargo_weight_tons, o.service_date
    into requested_vehicle_type, requested_weight, v_service_date
  from public.orders o
  where o.id = p_order_id
    and o.status = 'placed'::public.order_status
    and o.driver_id is null;

  if requested_vehicle_type is null or v_service_date is null then return; end if;

  select request.driver_id, request.truck_id
    into target_driver_id, target_truck_id
  from public.customer_dispatch_requests request
  where request.order_id = p_order_id
    and request.status = 'requested'
  limit 1;

  if target_driver_id is not null and target_driver_id <> current_user_id then
    return;
  end if;

  return query
  select t.id, t.plate_number, t.vehicle_type, t.capacity_tons, t.status::text
  from public.trucks t
  where (
      t.created_by = current_user_id
      or t.driver_id = current_user_id
      or (target_driver_id = current_user_id and target_truck_id = t.id)
    )
    and (
      (t.status = 'available' and (t.driver_id is null or t.driver_id = current_user_id))
      or (t.status = 'assigned' and t.driver_id = current_user_id)
    )
    and public.truck_type_can_fulfill(requested_vehicle_type, t.vehicle_type)
    and (
      requested_weight is null
      or (t.capacity_tons is not null and t.capacity_tons >= requested_weight)
    )
    and public.dispatch_documents_valid(current_user_id, t.id)
    and not exists (
      select 1
      from public.orders active_order
      where active_order.truck_id = t.id
        and active_order.service_date = v_service_date
        and active_order.status in (
          'accepted'::public.order_status,
          'in_transit'::public.order_status
        )
    )
    and (target_truck_id is null or t.id = target_truck_id)
  order by
    case when target_truck_id = t.id then 0 else 1 end,
    case when lower(btrim(t.vehicle_type)) = lower(btrim(requested_vehicle_type)) then 0 else 1 end,
    t.capacity_tons asc nulls last,
    t.updated_at asc nulls first;
end;
$$;

create or replace function public.claim_order_with_truck(p_order_id uuid, p_truck_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_vehicle_type text;
  requested_weight numeric;
  truck_vehicle_type text;
  truck_capacity numeric;
  truck_status text;
  truck_driver_id uuid;
  truck_created_by uuid;
  target_driver_id uuid;
  target_truck_id uuid;
  v_service_date date;
  affected_rows integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_approved_driver() then raise exception 'Driver account is not approved'; end if;
  if public.driver_commission_balance(current_user_id) > 0.005 then
    raise exception 'Commission settlement required before accepting another load';
  end if;

  select o.vehicle_type, o.cargo_weight_tons, o.service_date
    into requested_vehicle_type, requested_weight, v_service_date
  from public.orders o
  where o.id = p_order_id
    and o.driver_id is null
    and o.status = 'placed'::public.order_status
  for update;

  if not found then return false; end if;

  select request.driver_id, request.truck_id
    into target_driver_id, target_truck_id
  from public.customer_dispatch_requests request
  where request.order_id = p_order_id
    and request.status = 'requested'
  limit 1;

  if target_driver_id is not null
     and (target_driver_id <> current_user_id or target_truck_id <> p_truck_id) then
    raise exception 'This customer requested a different driver or truck';
  end if;

  if exists (
    select 1
    from public.orders scheduled
    where scheduled.driver_id = current_user_id
      and scheduled.service_date = v_service_date
      and scheduled.id <> p_order_id
  ) then
    raise exception 'You already have a load assigned for this service date';
  end if;

  select t.vehicle_type, t.capacity_tons, t.status::text, t.driver_id, t.created_by
    into truck_vehicle_type, truck_capacity, truck_status, truck_driver_id, truck_created_by
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then raise exception 'Selected truck was not found'; end if;

  if not (
    truck_created_by = current_user_id
    or truck_driver_id = current_user_id
    or (target_driver_id = current_user_id and target_truck_id = p_truck_id)
  ) then
    raise exception 'Selected truck is not registered or requested for this driver';
  end if;

  if not public.truck_type_can_fulfill(requested_vehicle_type, truck_vehicle_type) then
    raise exception 'Selected % truck cannot take this % load', truck_vehicle_type, requested_vehicle_type;
  end if;

  if requested_weight is not null
     and (truck_capacity is null or truck_capacity < requested_weight) then
    raise exception 'Selected truck capacity is below the required % tons', requested_weight;
  end if;

  if not public.dispatch_documents_valid(current_user_id, p_truck_id) then
    raise exception 'Driver or truck documents are incomplete, expired, or not verified';
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.service_date = v_service_date
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Selected truck is already assigned for this service date';
  end if;

  if not (
    (truck_status = 'available' and (truck_driver_id is null or truck_driver_id = current_user_id))
    or (truck_status = 'assigned' and truck_driver_id = current_user_id)
  ) then
    raise exception 'Selected truck is no longer available';
  end if;

  update public.trucks
  set status = 'assigned', driver_id = current_user_id, updated_at = now()
  where id = p_truck_id;

  update public.orders
  set driver_id = current_user_id,
      truck_id = p_truck_id,
      status = 'accepted'::public.order_status,
      accepted_at = now()
  where id = p_order_id
    and driver_id is null
    and status = 'placed'::public.order_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then return false; end if;
  return true;
end;
$$;

-- Service-date booking wrapper preserves every authoritative v1 argument and
-- only adds the calendar date. No quote, cargo or payment formula is duplicated.
create or replace function public.customer_create_booking_v2(
  p_customer_id uuid,
  p_request_id uuid,
  p_pickup_address text,
  p_pickup_longitude numeric,
  p_pickup_latitude numeric,
  p_dropoff_address text,
  p_dropoff_longitude numeric,
  p_dropoff_latitude numeric,
  p_vehicle_type text,
  p_distance_km numeric,
  p_cargo_quantity numeric,
  p_cargo_unit text,
  p_cargo_category text,
  p_packaging_type text,
  p_cargo_notes text,
  p_selected_payment_method text,
  p_expected_quote_etb numeric,
  p_service_date date
)
returns table(
  id uuid,
  tracking_id text,
  pickup_address text,
  dropoff_address text,
  vehicle_type text,
  distance_km numeric,
  price_etb numeric,
  status public.order_status,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created record;
  v_existing_service_date date;
begin
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if p_service_date < (now() at time zone 'Africa/Addis_Ababa')::date then
    raise exception 'Service date cannot be in the past' using errcode = '22007';
  end if;

  select * into v_created
  from public.customer_create_booking_v1(
    p_customer_id,
    p_request_id,
    p_pickup_address,
    p_pickup_longitude,
    p_pickup_latitude,
    p_dropoff_address,
    p_dropoff_longitude,
    p_dropoff_latitude,
    p_vehicle_type,
    p_distance_km,
    p_cargo_quantity,
    p_cargo_unit,
    p_cargo_category,
    p_packaging_type,
    p_cargo_notes,
    p_selected_payment_method,
    p_expected_quote_etb
  );

  if v_created.reused then
    select o.service_date into v_existing_service_date
    from public.orders o
    where o.id = v_created.id;
    if v_existing_service_date is distinct from p_service_date then
      raise exception 'Booking request was already created for a different service date' using errcode = '22023';
    end if;
  else
    update public.orders o
    set service_date = p_service_date
    where o.id = v_created.id;
  end if;

  return query
  select
    v_created.id,
    v_created.tracking_id,
    v_created.pickup_address,
    v_created.dropoff_address,
    v_created.vehicle_type,
    v_created.distance_km,
    v_created.price_etb,
    v_created.status,
    v_created.reused;
end;
$$;
revoke all on function public.customer_create_booking_v2(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, text, numeric, date
) from public, anon, authenticated;
grant execute on function public.customer_create_booking_v2(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, text, numeric, date
) to service_role;

comment on column public.orders.service_date is
  'Authoritative HALLO service/pickup calendar date used by dispatch daily-assignment guards.';
comment on function public.get_available_jobs_v2() is
  'Driver marketplace jobs plus authoritative service_date; eligibility remains delegated to get_available_jobs().';

notify pgrst, 'reload schema';
commit;
