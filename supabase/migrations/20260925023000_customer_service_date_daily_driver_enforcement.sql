begin;

alter table public.orders
  add column if not exists service_date date;

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
returns trigger language plpgsql set search_path = public as $$
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
returns trigger language plpgsql set search_path = public as $$
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
create or replace function public.customer_create_booking_v2(
  p_customer_id uuid, p_request_id uuid,
  p_pickup_address text, p_pickup_longitude numeric, p_pickup_latitude numeric,
  p_dropoff_address text, p_dropoff_longitude numeric, p_dropoff_latitude numeric,
  p_vehicle_type text, p_distance_km numeric, p_price_etb numeric,
  p_cargo_category text, p_cargo_description text, p_packaging_type text,
  p_selected_payment_method text, p_service_date date, p_total_weight_kg numeric default null
)
returns table(id uuid, tracking_id text, pickup_address text, dropoff_address text,
  vehicle_type text, distance_km numeric, price_etb numeric, status public.order_status, reused boolean)
language plpgsql security definer set search_path = public, private as $$
declare v_created record;
begin
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if p_service_date < (now() at time zone 'Africa/Addis_Ababa')::date then
    raise exception 'Service date cannot be in the past';
  end if;

  select * into v_created from public.customer_create_booking_v1(
    p_customer_id, p_request_id, p_pickup_address, p_pickup_longitude, p_pickup_latitude,
    p_dropoff_address, p_dropoff_longitude, p_dropoff_latitude, p_vehicle_type,
    p_distance_km, p_price_etb, p_cargo_category, p_cargo_description,
    p_packaging_type, p_selected_payment_method, p_total_weight_kg
  );
  update public.orders set service_date = p_service_date where orders.id = v_created.id;
  return query select v_created.id, v_created.tracking_id, v_created.pickup_address,
    v_created.dropoff_address, v_created.vehicle_type, v_created.distance_km,
    v_created.price_etb, v_created.status, v_created.reused;
end;
$$;
revoke all on function public.customer_create_booking_v2(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, date, numeric
) from public, anon, authenticated;
grant execute on function public.customer_create_booking_v2(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, date, numeric
) to service_role;

comment on column public.orders.service_date is
  'Authoritative HALLO service/pickup calendar date used by dispatch daily-assignment guards.';

notify pgrst, 'reload schema';
commit;