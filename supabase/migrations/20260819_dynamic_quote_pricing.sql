begin;

create table if not exists public.quote_pricing_rules (
  vehicle_key text primary key,
  vehicle_type text not null unique,
  sort_order integer not null default 0,
  rate_per_km numeric(12,2) not null check (rate_per_km > 0),
  rate_per_ton numeric(12,2) not null check (rate_per_ton >= 0),
  base_fee_etb numeric(12,2) not null check (base_fee_etb >= 0),
  minimum_fare_etb numeric(12,2) not null check (minimum_fare_etb > 0),
  market_adjustment_percent numeric(7,3) not null default 0
    check (market_adjustment_percent between -50 and 300),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.quote_pricing_audit (
  id bigint generated always as identity primary key,
  vehicle_key text not null,
  old_values jsonb not null,
  new_values jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.quote_pricing_rules (
  vehicle_key,
  vehicle_type,
  sort_order,
  rate_per_km,
  rate_per_ton,
  base_fee_etb,
  minimum_fare_etb,
  market_adjustment_percent
)
values
  ('pickup', 'Pickup', 10, 48, 650, 900, 1500, 0),
  ('van', 'Van', 20, 58, 650, 900, 1500, 0),
  ('dry cargo', 'Dry Cargo', 30, 72, 650, 900, 1500, 0),
  ('refrigerated', 'Refrigerated', 40, 92, 650, 900, 1500, 0),
  ('trailer', 'Trailer', 50, 110, 650, 900, 1500, 0)
on conflict (vehicle_key) do nothing;

alter table public.quote_pricing_rules enable row level security;
alter table public.quote_pricing_audit enable row level security;

revoke all on table public.quote_pricing_rules from public, anon, authenticated;
revoke all on table public.quote_pricing_audit from public, anon, authenticated;
grant all on table public.quote_pricing_rules to service_role;
grant all on table public.quote_pricing_audit to service_role;

create or replace function public.get_quote_pricing_rules()
returns table (
  vehicle_key text,
  vehicle_type text,
  rate_per_km numeric,
  rate_per_ton numeric,
  base_fee_etb numeric,
  minimum_fare_etb numeric,
  market_adjustment_percent numeric,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    r.vehicle_key,
    r.vehicle_type,
    r.rate_per_km,
    r.rate_per_ton,
    r.base_fee_etb,
    r.minimum_fare_etb,
    r.market_adjustment_percent,
    r.updated_at
  from public.quote_pricing_rules r
  where r.active
  order by r.sort_order, r.vehicle_type;
$function$;

revoke all on function public.get_quote_pricing_rules() from public, anon;
grant execute on function public.get_quote_pricing_rules() to authenticated;

create or replace function public.calculate_transport_quote(
  p_distance_km numeric,
  p_vehicle_type text,
  p_cargo_tons numeric
)
returns table (
  vehicle_type text,
  distance_km numeric,
  cargo_tons numeric,
  distance_charge_etb numeric,
  weight_charge_etb numeric,
  base_fee_etb numeric,
  market_adjustment_etb numeric,
  total_quote_etb numeric,
  commission_etb numeric,
  driver_net_etb numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_rule public.quote_pricing_rules%rowtype;
  v_subtotal numeric;
  v_adjustment numeric;
  v_total numeric;
begin
  if p_distance_km is null or p_distance_km <= 0 then
    raise exception 'Distance must be greater than zero';
  end if;

  if p_cargo_tons is null or p_cargo_tons <= 0 then
    raise exception 'Cargo weight must be greater than zero';
  end if;

  select *
    into v_rule
  from public.quote_pricing_rules r
  where r.vehicle_key = lower(btrim(p_vehicle_type))
    and r.active;

  if not found then
    raise exception 'No active pricing rule exists for vehicle type %', p_vehicle_type;
  end if;

  v_subtotal := v_rule.base_fee_etb
    + (p_distance_km * v_rule.rate_per_km)
    + (p_cargo_tons * v_rule.rate_per_ton);
  v_adjustment := round(v_subtotal * v_rule.market_adjustment_percent / 100.0, 2);
  v_total := greatest(
    v_rule.minimum_fare_etb,
    round((v_subtotal + v_adjustment) / 50.0) * 50.0
  );

  return query
  select
    v_rule.vehicle_type,
    round(p_distance_km, 2),
    round(p_cargo_tons, 3),
    round(p_distance_km * v_rule.rate_per_km, 2),
    round(p_cargo_tons * v_rule.rate_per_ton, 2),
    v_rule.base_fee_etb,
    v_adjustment,
    v_total,
    round(v_total * 0.02, 2),
    round(v_total * 0.98, 2);
end;
$function$;

revoke all on function public.calculate_transport_quote(numeric, text, numeric) from public, anon;
grant execute on function public.calculate_transport_quote(numeric, text, numeric) to authenticated;

create or replace function public.admin_update_quote_pricing_rule(
  p_vehicle_key text,
  p_rate_per_km numeric,
  p_rate_per_ton numeric,
  p_base_fee_etb numeric,
  p_minimum_fare_etb numeric,
  p_market_adjustment_percent numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role', '');
  v_key text := lower(btrim(p_vehicle_key));
  v_old public.quote_pricing_rules%rowtype;
  v_new public.quote_pricing_rules%rowtype;
begin
  if v_actor is null then
    raise exception 'Sign in required';
  end if;

  if v_role not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  if p_rate_per_km is null or p_rate_per_km <= 0 then
    raise exception 'Rate per kilometre must be greater than zero';
  end if;
  if p_rate_per_ton is null or p_rate_per_ton < 0 then
    raise exception 'Rate per ton cannot be negative';
  end if;
  if p_base_fee_etb is null or p_base_fee_etb < 0 then
    raise exception 'Base fee cannot be negative';
  end if;
  if p_minimum_fare_etb is null or p_minimum_fare_etb <= 0 then
    raise exception 'Minimum fare must be greater than zero';
  end if;
  if p_market_adjustment_percent is null
    or p_market_adjustment_percent < -50
    or p_market_adjustment_percent > 300 then
    raise exception 'Fuel and market adjustment must be between -50 and 300 percent';
  end if;

  select * into v_old
  from public.quote_pricing_rules
  where vehicle_key = v_key
  for update;

  if not found then
    raise exception 'Pricing rule not found for %', p_vehicle_key;
  end if;

  update public.quote_pricing_rules
  set rate_per_km = p_rate_per_km,
      rate_per_ton = p_rate_per_ton,
      base_fee_etb = p_base_fee_etb,
      minimum_fare_etb = p_minimum_fare_etb,
      market_adjustment_percent = p_market_adjustment_percent,
      updated_at = now(),
      updated_by = v_actor
  where vehicle_key = v_key
  returning * into v_new;

  insert into public.quote_pricing_audit (
    vehicle_key,
    old_values,
    new_values,
    updated_by
  ) values (
    v_key,
    to_jsonb(v_old),
    to_jsonb(v_new),
    v_actor
  );
end;
$function$;

revoke all on function public.admin_update_quote_pricing_rule(text, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_update_quote_pricing_rule(text, numeric, numeric, numeric, numeric, numeric) to authenticated;

commit;
