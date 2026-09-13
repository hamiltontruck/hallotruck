begin;

create table if not exists private.customer_booking_requests (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (customer_id, request_id)
);

revoke all on table private.customer_booking_requests from public, anon, authenticated;

create or replace function public.customer_create_booking_v1(
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
  p_expected_quote_etb numeric
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
  v_profile public.profiles%rowtype;
  v_capacity numeric;
  v_cargo_tons numeric;
  v_quote numeric;
  v_tracking_id text;
  v_order_id uuid;
  v_inserted_count integer := 0;
  v_cargo_description text;
  v_pickup_in_region boolean;
  v_dropoff_in_region boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_customer_id is null or p_request_id is null then
    raise exception 'Customer and booking request are required';
  end if;

  select p.*
    into v_profile
  from public.profiles p
  where p.id = p_customer_id
    and p.role::text = 'customer'
  limit 1;

  if not found then
    raise exception 'Customer account is not authorized' using errcode = '42501';
  end if;

  if p_pickup_address is null or char_length(btrim(p_pickup_address)) not between 2 and 240 then
    raise exception 'Pickup address is invalid';
  end if;
  if p_dropoff_address is null or char_length(btrim(p_dropoff_address)) not between 2 and 240 then
    raise exception 'Drop-off address is invalid';
  end if;

  if p_pickup_longitude is null or p_pickup_longitude < -180 or p_pickup_longitude > 180
     or p_pickup_latitude is null or p_pickup_latitude < -90 or p_pickup_latitude > 90 then
    raise exception 'Pickup coordinates are invalid';
  end if;
  if p_dropoff_longitude is null or p_dropoff_longitude < -180 or p_dropoff_longitude > 180
     or p_dropoff_latitude is null or p_dropoff_latitude < -90 or p_dropoff_latitude > 90 then
    raise exception 'Drop-off coordinates are invalid';
  end if;
  if p_pickup_longitude = p_dropoff_longitude and p_pickup_latitude = p_dropoff_latitude then
    raise exception 'Pickup and drop-off must be different places';
  end if;

  v_pickup_in_region :=
    (p_pickup_longitude between 32.8 and 48.1 and p_pickup_latitude between 3.0 and 15.2)
    or (p_pickup_longitude between 41.6 and 43.6 and p_pickup_latitude between 10.8 and 12.9)
    or (p_pickup_longitude between 40.8 and 51.7 and p_pickup_latitude between -1.9 and 12.3);
  v_dropoff_in_region :=
    (p_dropoff_longitude between 32.8 and 48.1 and p_dropoff_latitude between 3.0 and 15.2)
    or (p_dropoff_longitude between 41.6 and 43.6 and p_dropoff_latitude between 10.8 and 12.9)
    or (p_dropoff_longitude between 40.8 and 51.7 and p_dropoff_latitude between -1.9 and 12.3);

  if not v_pickup_in_region or not v_dropoff_in_region then
    raise exception 'Pickup and drop-off must be inside the HALLO operating corridor';
  end if;

  if p_distance_km is null or p_distance_km <= 0 or p_distance_km > 5000 then
    raise exception 'Route distance is invalid';
  end if;
  if p_vehicle_type is null or char_length(btrim(p_vehicle_type)) < 2 then
    raise exception 'Vehicle type is invalid';
  end if;
  if p_cargo_quantity is null or p_cargo_quantity <= 0 then
    raise exception 'Cargo quantity is invalid';
  end if;
  if p_cargo_unit not in ('ton', 'quintal') then
    raise exception 'Cargo unit is invalid';
  end if;

  v_cargo_tons := case when p_cargo_unit = 'quintal' then p_cargo_quantity / 10.0 else p_cargo_quantity end;
  v_capacity := public.vehicle_billing_capacity_tons(p_vehicle_type);
  if v_capacity is null then
    raise exception 'Vehicle type is not supported';
  end if;
  if v_cargo_tons > v_capacity then
    raise exception 'Cargo load exceeds vehicle capacity';
  end if;

  if p_cargo_category not in ('food', 'grain_rice', 'cooking_oil', 'metal_steel', 'construction_materials', 'general_goods', 'other') then
    raise exception 'Cargo category is invalid';
  end if;
  if p_packaging_type not in ('bagged', 'drum_tank', 'pallet', 'loose_bulk', 'container_20ft', 'container_40ft', 'other') then
    raise exception 'Packaging type is invalid';
  end if;
  if p_packaging_type in ('container_20ft', 'container_40ft') and lower(btrim(p_vehicle_type)) <> 'trailer' then
    raise exception 'A container booking requires a Trailer';
  end if;
  if char_length(btrim(coalesce(p_cargo_notes, ''))) > 500 then
    raise exception 'Cargo notes are too long';
  end if;
  if p_cargo_category = 'other' and char_length(btrim(coalesce(p_cargo_notes, ''))) < 3 then
    raise exception 'Other cargo requires notes';
  end if;
  if p_selected_payment_method not in ('cash', 'bank_telebirr') then
    raise exception 'Payment method is invalid';
  end if;
  if p_expected_quote_etb is null or p_expected_quote_etb <= 0 then
    raise exception 'Displayed quote is invalid';
  end if;

  insert into private.customer_booking_requests(customer_id, request_id)
  values (p_customer_id, p_request_id)
  on conflict (customer_id, request_id) do nothing;
  get diagnostics v_inserted_count = row_count;

  if v_inserted_count = 0 then
    select r.order_id into v_order_id
    from private.customer_booking_requests r
    where r.customer_id = p_customer_id
      and r.request_id = p_request_id;

    if v_order_id is null then
      raise exception 'Booking request is already being processed' using errcode = '55P03';
    end if;

    return query
    select o.id, o.tracking_id, o.pickup_address, o.dropoff_address, o.vehicle_type,
           o.distance_km, o.price_etb, o.status, true
    from public.orders o
    where o.id = v_order_id;
    return;
  end if;

  select q.total_quote_etb
    into v_quote
  from public.calculate_transport_quote_v2(p_distance_km, p_vehicle_type, v_cargo_tons) q
  limit 1;

  if v_quote is null or v_quote <= 0 then
    raise exception 'Quote calculation failed';
  end if;
  if abs(v_quote - p_expected_quote_etb) > 0.01 then
    raise exception 'Quote changed. Refresh and confirm the latest price';
  end if;

  v_cargo_description := concat_ws(
    ' · ',
    case p_cargo_category
      when 'food' then 'Food'
      when 'grain_rice' then 'Grain / rice'
      when 'cooking_oil' then 'Cooking oil'
      when 'metal_steel' then 'Metal / steel'
      when 'construction_materials' then 'Construction materials'
      when 'general_goods' then 'General goods'
      else 'Other'
    end,
    case p_packaging_type
      when 'bagged' then 'Bagged'
      when 'drum_tank' then 'Drum / tank'
      when 'pallet' then 'Pallet'
      when 'loose_bulk' then 'Loose / bulk'
      when 'container_20ft' then '20 ft container'
      when 'container_40ft' then '40 ft container'
      else 'Other packaging'
    end,
    trim(to_char(p_cargo_quantity, 'FM999999990.##')) || ' ' || case when p_cargo_unit = 'quintal' then 'quintal' else 'ton' end,
    nullif(btrim(coalesce(p_cargo_notes, '')), '')
  );

  loop
    v_tracking_id := 'HT-' || extract(year from now())::int || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.orders(
        tracking_id,
        customer_id,
        customer_name,
        customer_phone,
        pickup_address,
        pickup,
        dropoff_address,
        dropoff,
        vehicle_type,
        distance_km,
        cargo_quantity,
        cargo_unit,
        cargo_category,
        packaging_type,
        cargo_notes,
        cargo_description,
        price_etb,
        selected_payment_method,
        payment_terms,
        status
      )
      values (
        v_tracking_id,
        p_customer_id,
        coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(v_profile.email), ''), 'Customer'),
        coalesce(v_profile.phone, ''),
        btrim(p_pickup_address),
        extensions.st_setsrid(extensions.st_makepoint(p_pickup_longitude::double precision, p_pickup_latitude::double precision), 4326)::extensions.geography,
        btrim(p_dropoff_address),
        extensions.st_setsrid(extensions.st_makepoint(p_dropoff_longitude::double precision, p_dropoff_latitude::double precision), 4326)::extensions.geography,
        btrim(p_vehicle_type),
        round(p_distance_km, 2),
        p_cargo_quantity,
        p_cargo_unit,
        p_cargo_category,
        p_packaging_type,
        nullif(btrim(coalesce(p_cargo_notes, '')), ''),
        v_cargo_description,
        v_quote,
        p_selected_payment_method,
        'pay_driver_on_delivery',
        'placed'::public.order_status
      )
      returning public.orders.id into v_order_id;
      exit;
    exception when unique_violation then
      -- Tracking IDs are random; retry only the extremely unlikely tracking collision.
      if exists (select 1 from public.orders o where o.tracking_id = v_tracking_id) then
        continue;
      end if;
      raise;
    end;
  end loop;

  update private.customer_booking_requests
  set order_id = v_order_id
  where customer_id = p_customer_id
    and request_id = p_request_id;

  return query
  select o.id, o.tracking_id, o.pickup_address, o.dropoff_address, o.vehicle_type,
         o.distance_km, o.price_etb, o.status, false
  from public.orders o
  where o.id = v_order_id;
end;
$$;

revoke all on function public.customer_create_booking_v1(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, text, numeric
) from public, anon, authenticated;
grant execute on function public.customer_create_booking_v1(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, text, numeric
) to service_role;

comment on function public.customer_create_booking_v1(
  uuid, uuid, text, numeric, numeric, text, numeric, numeric, text, numeric,
  numeric, text, text, text, text, text, numeric
) is 'Internal service-role booking commit for Customer apps. Revalidates Customer role, load/capacity, quote and idempotency before creating an order.';

notify pgrst, 'reload schema';
commit;
