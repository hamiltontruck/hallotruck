begin;

create or replace function public.admin_place_partner_order(
  p_order_id uuid,
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
  v_partner_name text;
  v_partner_status text;
  v_canonical_id uuid;
  v_tracking_id text;
  v_pickup_address text;
  v_dropoff_address text;
  v_vehicle_type text;
  v_payment_method text;
  v_category_key text;
  v_cargo_category text;
  v_cargo_notes text;
  v_weight numeric;
begin
  if v_actor is null or p_request_key is null then
    raise exception 'Admin session and request key are required';
  end if;
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text, 0));
  select * into v_order
  from public.partner_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Partner order not found';
  end if;

  if v_order.canonical_order_id is not null then
    if not exists (select 1 from public.orders where id = v_order.canonical_order_id) then
      raise exception 'Partner order canonical link is inconsistent';
    end if;
    return v_order;
  end if;

  if v_order.status <> 'approved' then
    raise exception 'Only approved Partner orders can be placed';
  end if;
  if v_order.approved_at is null
    or v_order.quote_amount_etb is null
    or v_order.quote_amount_etb <= 0
    or v_order.quote_version <= 0
  then
    raise exception 'Approved Partner order must have a valid accepted HALLO quote';
  end if;

  select organization.name, organization.status
  into v_partner_name, v_partner_status
  from public.partner_organizations organization
  where organization.id = v_order.partner_id;

  if not found or v_partner_status <> 'active' then
    raise exception 'Active Partner organization is required for canonical placement';
  end if;

  v_pickup_address := concat_ws(', ',
    nullif(btrim(v_order.pickup_location->>'address'), ''),
    nullif(btrim(v_order.pickup_location->>'city'), ''),
    nullif(btrim(v_order.pickup_location->>'region'), ''),
    nullif(btrim(v_order.pickup_location->>'country'), '')
  );
  v_dropoff_address := concat_ws(', ',
    nullif(btrim(v_order.dropoff_location->>'address'), ''),
    nullif(btrim(v_order.dropoff_location->>'city'), ''),
    nullif(btrim(v_order.dropoff_location->>'region'), ''),
    nullif(btrim(v_order.dropoff_location->>'country'), '')
  );
  v_vehicle_type := nullif(btrim(v_order.vehicle_requirements->>'truck_type'), '');
  v_payment_method := lower(btrim(coalesce(v_order.payment->>'method', '')));
  v_weight := (v_order.cargo->>'weight_tons')::numeric;

  if v_pickup_address = '' or v_dropoff_address = '' or v_vehicle_type is null or v_weight <= 0 then
    raise exception 'Partner order location, vehicle and cargo data are incomplete';
  end if;
  if v_payment_method not in ('invoice', 'bank', 'telebirr') then
    raise exception 'Partner order payment method is not supported for canonical placement';
  end if;

  v_category_key := trim(both '_' from pg_catalog.regexp_replace(
    lower(btrim(coalesce(v_order.cargo->>'category', ''))),
    '[^a-z0-9]+', '_', 'g'
  ));
  v_cargo_category := case
    when v_category_key in ('food', 'foods') then 'food'
    when v_category_key in ('grain', 'rice', 'grain_rice', 'grain_and_rice') then 'grain_rice'
    when v_category_key in ('oil', 'cooking_oil') then 'cooking_oil'
    when v_category_key in ('metal', 'steel', 'metal_steel', 'metal_and_steel') then 'metal_steel'
    when v_category_key in ('construction', 'construction_material', 'construction_materials') then 'construction_materials'
    when v_category_key in ('general', 'general_goods', 'goods') then 'general_goods'
    else 'other'
  end;

  v_cargo_notes := nullif(left(concat_ws(' · ',
    case when v_cargo_category = 'other' then 'Partner category: ' || coalesce(nullif(btrim(v_order.cargo->>'category'), ''), 'Other') end,
    case when coalesce((v_order.cargo->>'fragile')::boolean, false) then 'Fragile' end,
    case when coalesce((v_order.cargo->>'hazardous')::boolean, false) then 'Hazardous' end,
    case when coalesce((v_order.cargo->>'temperature_controlled')::boolean, false) then 'Temperature controlled' end,
    nullif(btrim(v_order.cargo->>'handling_instructions'), ''),
    nullif(btrim(v_order.partner_notes), '')
  ), 500), '');
  if v_cargo_category = 'other' and length(btrim(coalesce(v_cargo_notes, ''))) < 3 then
    v_cargo_notes := 'Partner cargo category';
  end if;

  v_canonical_id := gen_random_uuid();
  v_tracking_id := 'HT-' || to_char(pg_catalog.clock_timestamp(), 'YYYY') || '-' || upper(substr(replace(v_canonical_id::text, '-', ''), 1, 8));

  insert into public.orders (
    id,
    tracking_id,
    customer_name,
    customer_phone,
    pickup_address,
    dropoff_address,
    vehicle_type,
    price_etb,
    status,
    payment_status,
    cargo_description,
    cargo_quantity,
    cargo_unit,
    payment_terms,
    cargo_category,
    packaging_type,
    cargo_notes,
    selected_payment_method
  ) values (
    v_canonical_id,
    v_tracking_id,
    v_partner_name,
    nullif(btrim(v_order.pickup_contact->>'phone'), ''),
    v_pickup_address,
    v_dropoff_address,
    v_vehicle_type,
    v_order.quote_amount_etb,
    'placed'::public.order_status,
    'unpaid'::public.payment_status,
    nullif(btrim(v_order.cargo->>'description'), ''),
    v_weight,
    'ton',
    'prepaid',
    v_cargo_category,
    'loose_bulk',
    v_cargo_notes,
    'bank_telebirr'
  );

  update public.partner_orders
  set canonical_order_id = v_canonical_id,
      status = 'placed',
      pricing = coalesce(pricing, '{}'::jsonb) || jsonb_build_object(
        'state', 'approved',
        'canonical_order_id', v_canonical_id,
        'canonical_tracking_id', v_tracking_id,
        'placed_at', now()
      ),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.partner_order_status_history (
    partner_order_id, partner_id, from_status, to_status, actor_id, reason, metadata
  ) values (
    v_order.id,
    v_order.partner_id,
    'approved',
    'placed',
    v_actor,
    'Approved Partner order placed into canonical HALLO orders',
    jsonb_build_object(
      'request_key', p_request_key,
      'canonical_order_id', v_canonical_id,
      'canonical_tracking_id', v_tracking_id,
      'quote_amount_etb', v_order.quote_amount_etb,
      'quote_version', v_order.quote_version,
      'partner_payment_method', v_payment_method,
      'canonical_payment_method', 'bank_telebirr',
      'canonical_payment_terms', 'prepaid'
    )
  );

  insert into public.partner_activity_log (
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_order.partner_id,
    v_actor,
    'partner_order_canonical_placed',
    'partner_order',
    v_order.id::text,
    jsonb_build_object(
      'reference', v_order.reference,
      'request_key', p_request_key,
      'canonical_order_id', v_canonical_id,
      'canonical_tracking_id', v_tracking_id,
      'quote_amount_etb', v_order.quote_amount_etb
    )
  );

  return v_order;
end;
$$;

revoke all on function public.admin_place_partner_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_place_partner_order(uuid, uuid) to authenticated;

commit;
