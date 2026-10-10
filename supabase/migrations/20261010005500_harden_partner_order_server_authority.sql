begin;

alter table public.partner_orders
  add column if not exists route_distance_km numeric(12,3),
  add column if not exists route_duration_minutes numeric(12,3),
  add column if not exists route_provider text,
  add column if not exists route_profile text,
  add column if not exists route_verified_at timestamptz;

alter table public.partner_orders
  drop constraint if exists partner_orders_server_verified_route_complete;
alter table public.partner_orders
  add constraint partner_orders_server_verified_route_complete
  check (
    (
      route_distance_km is null
      and route_duration_minutes is null
      and route_provider is null
      and route_profile is null
      and route_verified_at is null
    )
    or (
      route_distance_km > 0
      and route_duration_minutes > 0
      and route_provider = 'openrouteservice'
      and route_profile = 'driving-hgv'
      and route_verified_at is not null
    )
  );

create or replace function public.partner_save_order_draft(
  p_partner_id uuid,
  p_order_id uuid,
  p_payload jsonb,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_reference text;
  v_contact jsonb;
  v_phone text;
  v_email text;
  v_route jsonb := v_payload->'route';
  v_route_present boolean := v_payload ? 'route' and jsonb_typeof(v_payload->'route') = 'object';
  v_route_clear boolean := (
    (v_payload ? 'route' and jsonb_typeof(v_payload->'route') = 'null')
    or ((v_payload ? 'pickup_location' or v_payload ? 'dropoff_location') and not (v_payload ? 'route'))
  );
  v_pickup jsonb := coalesce(v_payload->'pickup_location','{}'::jsonb);
  v_dropoff jsonb := coalesce(v_payload->'dropoff_location','{}'::jsonb);
  v_pickup_longitude numeric;
  v_pickup_latitude numeric;
  v_dropoff_longitude numeric;
  v_dropoff_latitude numeric;
  v_distance_km numeric;
  v_duration_minutes numeric;
  v_straight_line_km numeric;
  v_average_speed_kmh numeric;
begin
  if v_actor is null then raise exception 'Partner session required'; end if;
  if p_partner_id is null or p_request_key is null then raise exception 'Partner organization and request key are required'; end if;
  if not exists (
    select 1 from public.partner_memberships membership
    join public.partner_organizations organization on organization.id=membership.partner_id
    join public.profiles profile on profile.id=membership.user_id
    where membership.partner_id=p_partner_id and membership.user_id=v_actor
      and membership.active and membership.member_role in ('owner','admin')
      and organization.status='active' and profile.role::text='partner'
  ) then raise exception 'Active Partner owner or admin access required'; end if;
  if jsonb_typeof(v_payload)<>'object' then raise exception 'Partner order payload must be an object'; end if;
  if length(coalesce(v_payload->>'partner_notes',''))>4000 then raise exception 'Partner notes must be 4000 characters or fewer'; end if;

  if (
    v_payload ?| array[
      'quoted_amount_etb','quote_amount_etb','total_quote_etb','price_etb',
      'expected_quote_etb','distance_km','duration_minutes','eta_minutes'
    ]
    or coalesce(v_payload->'pricing','{}'::jsonb) ?| array[
      'quoted_amount_etb','quote_amount_etb','total_quote_etb','price_etb',
      'expected_quote_etb','distance_km','duration_minutes','eta_minutes',
      'route_distance_km','route_duration_minutes'
    ]
  ) then
    raise exception 'Client price or route metrics are not accepted in pricing';
  end if;

  foreach v_contact in array array[v_payload->'pickup_contact',v_payload->'delivery_contact'] loop
    if v_contact is not null and jsonb_typeof(v_contact)<>'object' then raise exception 'Partner order contact must be an object'; end if;
    v_phone := regexp_replace(btrim(coalesce(v_contact->>'phone','')),'[[:space:]()-]','','g');
    v_email := lower(btrim(coalesce(v_contact->>'email','')));
    if v_phone<>'' and v_phone !~ '^(\+251|251|0)?9[0-9]{8}$' and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'Enter a valid Ethiopian mobile number or international number with country code';
    end if;
    if v_email<>'' and (length(v_email)>254 or v_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@.]{1,190}\.[A-Za-z]{2,63}$') then
      raise exception 'Enter a valid contact email address';
    end if;
  end loop;

  if v_payload ? 'route' and not v_route_present and not v_route_clear then
    raise exception 'Route must be an object or null';
  end if;

  if v_route_present then
    if coalesce(v_route->>'provider','') <> 'openrouteservice'
      or coalesce(v_route->>'profile','') <> 'driving-hgv'
    then
      raise exception 'Route provider must be openrouteservice driving-hgv';
    end if;
    if jsonb_typeof(v_route->'distance_km') is distinct from 'number'
      or jsonb_typeof(v_route->'duration_minutes') is distinct from 'number'
    then
      raise exception 'Route distance and ETA must be numeric';
    end if;
    if jsonb_typeof(v_pickup->'longitude') is distinct from 'number'
      or jsonb_typeof(v_pickup->'latitude') is distinct from 'number'
      or jsonb_typeof(v_dropoff->'longitude') is distinct from 'number'
      or jsonb_typeof(v_dropoff->'latitude') is distinct from 'number'
    then
      raise exception 'Pickup and destination coordinates are required for route verification';
    end if;

    v_pickup_longitude := (v_pickup->>'longitude')::numeric;
    v_pickup_latitude := (v_pickup->>'latitude')::numeric;
    v_dropoff_longitude := (v_dropoff->>'longitude')::numeric;
    v_dropoff_latitude := (v_dropoff->>'latitude')::numeric;
    v_distance_km := (v_route->>'distance_km')::numeric;
    v_duration_minutes := (v_route->>'duration_minutes')::numeric;

    if v_pickup_longitude not between -180 and 180
      or v_dropoff_longitude not between -180 and 180
      or v_pickup_latitude not between -90 and 90
      or v_dropoff_latitude not between -90 and 90
    then
      raise exception 'Pickup or destination coordinates are invalid';
    end if;
    if v_distance_km <= 0 or v_duration_minutes <= 0 then
      raise exception 'Route distance and ETA must be greater than zero';
    end if;

    v_straight_line_km := 6371.0088 * pg_catalog.acos(
      least(1.0, greatest(-1.0,
        pg_catalog.sin(pg_catalog.radians(v_pickup_latitude::double precision))
          * pg_catalog.sin(pg_catalog.radians(v_dropoff_latitude::double precision))
        + pg_catalog.cos(pg_catalog.radians(v_pickup_latitude::double precision))
          * pg_catalog.cos(pg_catalog.radians(v_dropoff_latitude::double precision))
          * pg_catalog.cos(pg_catalog.radians((v_dropoff_longitude-v_pickup_longitude)::double precision))
      ))
    );

    if v_straight_line_km < 0.1 then
      raise exception 'Pickup and destination must be different places';
    end if;
    if v_distance_km < v_straight_line_km then
      raise exception 'Route distance cannot be shorter than straight-line distance';
    end if;
    if v_distance_km > v_straight_line_km * 2.5 then
      raise exception 'Route distance exceeds the maximum allowed corridor factor';
    end if;

    v_average_speed_kmh := v_distance_km / (v_duration_minutes / 60.0);
    if v_average_speed_kmh < 10 or v_average_speed_kmh > 110 then
      raise exception 'Route ETA implies an invalid average HGV speed';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,0));
  select * into v_order from public.partner_orders where request_key=p_request_key and partner_id=p_partner_id;
  if found then return v_order; end if;

  if p_order_id is null then
    v_reference := 'PO-' || to_char(pg_catalog.clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.partner_orders(
      partner_id,request_key,reference,pickup_location,dropoff_location,cargo,
      vehicle_requirements,schedule,pickup_contact,delivery_contact,pricing,payment,
      partner_notes,created_by,route_distance_km,route_duration_minutes,
      route_provider,route_profile,route_verified_at
    ) values (
      p_partner_id,p_request_key,v_reference,
      coalesce(v_payload->'pickup_location','{}'::jsonb),
      coalesce(v_payload->'dropoff_location','{}'::jsonb),
      coalesce(v_payload->'cargo','{}'::jsonb),
      coalesce(v_payload->'vehicle_requirements','{}'::jsonb),
      coalesce(v_payload->'schedule','{}'::jsonb),
      coalesce(v_payload->'pickup_contact','{}'::jsonb),
      coalesce(v_payload->'delivery_contact','{}'::jsonb),
      coalesce(v_payload->'pricing','{}'::jsonb),
      coalesce(v_payload->'payment','{}'::jsonb),
      nullif(btrim(v_payload->>'partner_notes'),''),
      v_actor,
      case when v_route_present then round(v_distance_km,3) end,
      case when v_route_present then round(v_duration_minutes,3) end,
      case when v_route_present then 'openrouteservice' end,
      case when v_route_present then 'driving-hgv' end,
      case when v_route_present then now() end
    ) returning * into v_order;
    insert into public.partner_order_status_history(partner_order_id,partner_id,from_status,to_status,actor_id,reason)
    values(v_order.id,p_partner_id,null,'draft',v_actor,'Partner order draft created');
  else
    select * into v_order from public.partner_orders where id=p_order_id and partner_id=p_partner_id for update;
    if not found then raise exception 'Partner order draft not found'; end if;
    if v_order.status<>'draft' then raise exception 'Only draft Partner orders can be edited'; end if;
    update public.partner_orders set
      request_key=p_request_key,
      pickup_location=coalesce(v_payload->'pickup_location',pickup_location),
      dropoff_location=coalesce(v_payload->'dropoff_location',dropoff_location),
      cargo=coalesce(v_payload->'cargo',cargo),
      vehicle_requirements=coalesce(v_payload->'vehicle_requirements',vehicle_requirements),
      schedule=coalesce(v_payload->'schedule',schedule),
      pickup_contact=coalesce(v_payload->'pickup_contact',pickup_contact),
      delivery_contact=coalesce(v_payload->'delivery_contact',delivery_contact),
      pricing=coalesce(v_payload->'pricing',pricing),
      payment=coalesce(v_payload->'payment',payment),
      partner_notes=coalesce(nullif(btrim(v_payload->>'partner_notes'),''),partner_notes),
      route_distance_km=case
        when v_route_present then round(v_distance_km,3)
        when v_route_clear then null
        else route_distance_km
      end,
      route_duration_minutes=case
        when v_route_present then round(v_duration_minutes,3)
        when v_route_clear then null
        else route_duration_minutes
      end,
      route_provider=case
        when v_route_present then 'openrouteservice'
        when v_route_clear then null
        else route_provider
      end,
      route_profile=case
        when v_route_present then 'driving-hgv'
        when v_route_clear then null
        else route_profile
      end,
      route_verified_at=case
        when v_route_present then now()
        when v_route_clear then null
        else route_verified_at
      end,
      updated_at=now()
    where id=p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$$;

create or replace function public.admin_quote_partner_order_v2(
  p_order_id uuid,
  p_quote_expires_at timestamptz,
  p_admin_notes text,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_notes text := nullif(btrim(coalesce(p_admin_notes,'')),'');
  v_amount numeric(14,2);
  v_version integer;
  v_cargo_tons numeric;
  v_vehicle_type text;
begin
  if v_actor is null or p_request_key is null then
    raise exception 'Admin session and request key are required';
  end if;
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required.';
  end if;
  if p_quote_expires_at is null or p_quote_expires_at <= now() then
    raise exception 'Quote expiry must be in the future';
  end if;
  if length(coalesce(v_notes,'')) > 4000 then
    raise exception 'Admin notes must be 4000 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text,0));
  select * into v_order from public.partner_orders where id=p_order_id for update;
  if not found then raise exception 'Partner order not found'; end if;
  if v_order.status='quoted' then return v_order; end if;
  if v_order.status<>'under_review' then
    raise exception 'Only Partner orders under review can be quoted';
  end if;
  if v_order.route_distance_km is null
    or v_order.route_duration_minutes is null
    or v_order.route_provider <> 'openrouteservice'
    or v_order.route_profile <> 'driving-hgv'
    or v_order.route_verified_at is null
  then
    raise exception 'Server-verified route metrics are required before quoting';
  end if;

  v_cargo_tons := (v_order.cargo->>'weight_tons')::numeric;
  v_vehicle_type := nullif(btrim(v_order.vehicle_requirements->>'truck_type'),'');
  if v_cargo_tons is null or v_cargo_tons <= 0 or v_vehicle_type is null then
    raise exception 'Cargo weight and vehicle type are required before quoting';
  end if;

  select q.total_quote_etb
    into v_amount
  from public.calculate_transport_quote_v2(
    v_order.route_distance_km,
    v_vehicle_type,
    v_cargo_tons
  ) q
  limit 1;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Server quote calculation failed';
  end if;

  v_amount := round(v_amount,2);
  v_version := v_order.quote_version + 1;
  update public.partner_orders
  set status='quoted', quoted_at=now(), quoted_by=v_actor,
      quote_amount_etb=v_amount, quote_expires_at=p_quote_expires_at,
      quote_version=v_version,
      pricing=coalesce(pricing,'{}'::jsonb) || jsonb_build_object(
        'state','quoted','currency','ETB','quoted_amount_etb',v_amount,
        'quote_expires_at',p_quote_expires_at,'quote_version',v_version,
        'route_distance_km',v_order.route_distance_km,
        'route_duration_minutes',v_order.route_duration_minutes,
        'route_authority','server_verified'
      ),
      admin_notes=coalesce(v_notes,admin_notes), updated_at=now()
  where id=v_order.id
  returning * into v_order;

  insert into public.partner_order_status_history(
    partner_order_id,partner_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_order.id,v_order.partner_id,'under_review','quoted',v_actor,
    coalesce(v_notes,'HALLO server-authoritative quote issued'),
    jsonb_build_object(
      'request_key',p_request_key,'quote_amount_etb',v_amount,
      'quote_expires_at',p_quote_expires_at,'quote_version',v_version,
      'route_distance_km',v_order.route_distance_km,
      'route_duration_minutes',v_order.route_duration_minutes,
      'route_authority','server_verified'
    )
  );
  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    v_order.partner_id,v_actor,'partner_order_server_quote_issued','partner_order',v_order.id::text,
    jsonb_build_object(
      'reference',v_order.reference,'quote_amount_etb',v_amount,
      'quote_expires_at',p_quote_expires_at,'quote_version',v_version,
      'request_key',p_request_key,'route_authority','server_verified'
    )
  );
  return v_order;
end;
$$;

revoke all on function public.partner_save_order_draft(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.partner_save_order_draft(uuid,uuid,jsonb,uuid) to authenticated;

revoke all on function public.admin_quote_partner_order_v2(uuid,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_quote_partner_order_v2(uuid,timestamptz,text,uuid) to authenticated;

comment on function public.partner_save_order_draft(uuid,uuid,jsonb,uuid)
is 'Partner draft mutation with tenant authorization. Rejects client pricing and validates ORS HGV distance/ETA against straight-line and speed bounds before storing server-verified metrics.';

comment on function public.admin_quote_partner_order_v2(uuid,timestamptz,text,uuid)
is 'Admin/CEO-only Partner quote. Accepts no client price and computes the amount from stored server-verified route distance, vehicle type and cargo weight.';

notify pgrst, 'reload schema';
commit;
