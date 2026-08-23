create or replace function public.vehicle_billing_capacity_tons(p_vehicle_type text)
returns numeric
language sql
immutable
security definer
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_vehicle_type, '')))
    when 'pickup' then 3::numeric
    when 'van' then 5::numeric
    when 'isuzu 5 ton' then 5::numeric
    when 'dry cargo' then 10::numeric
    when 'refrigerated' then 15::numeric
    when 'truck 22 ton' then 22::numeric
    when 'truck 25 ton' then 25::numeric
    when 'truck 30 ton' then 30::numeric
    when 'trailer' then 45::numeric
    else null::numeric
  end;
$$;

revoke all on function public.vehicle_billing_capacity_tons(text) from public, anon, authenticated;

create or replace function public.calculate_transport_quote_v2(
  p_distance_km numeric,
  p_vehicle_type text,
  p_cargo_tons numeric
)
returns table(
  vehicle_type text,
  pricing_formula text,
  distance_km numeric,
  cargo_tons numeric,
  ton_kilometers numeric,
  rate_per_ton_km numeric,
  route_rate_per_ton_etb numeric,
  transport_charge_etb numeric,
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
as $$
declare
  v_rule public.quote_pricing_rules%rowtype;
  v_formula text;
  v_billable_tons numeric;
  v_ton_km numeric;
  v_effective_rate numeric;
  v_transport_charge numeric;
  v_route_rate_per_ton numeric;
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

  v_billable_tons := coalesce(public.vehicle_billing_capacity_tons(v_rule.vehicle_type), p_cargo_tons);

  if p_cargo_tons > v_billable_tons + 0.005 then
    raise exception '% supports up to % tons; submitted load is % tons',
      v_rule.vehicle_type,
      v_billable_tons,
      p_cargo_tons;
  end if;

  v_ton_km := p_distance_km * v_billable_tons;

  if v_rule.rate_per_ton_km is not null and v_rule.rate_per_ton_km > 0 then
    v_formula := 'ton_km';
    v_effective_rate := v_rule.rate_per_ton_km;
    v_transport_charge := round(v_ton_km * v_effective_rate, 2);
  else
    v_formula := 'legacy';
    v_transport_charge := round(
      (p_distance_km * v_rule.rate_per_km)
      + (v_billable_tons * v_rule.rate_per_ton),
      2
    );
    v_effective_rate := round(v_transport_charge / v_ton_km, 6);
  end if;

  v_route_rate_per_ton := round(v_transport_charge / v_billable_tons, 2);
  v_adjustment := round(v_transport_charge * v_rule.market_adjustment_percent / 100.0, 2);
  v_total := greatest(0, round(v_transport_charge + v_adjustment, 0));

  return query
  select
    v_rule.vehicle_type,
    v_formula,
    round(p_distance_km, 3),
    round(v_billable_tons, 3),
    round(v_ton_km, 3),
    v_effective_rate,
    v_route_rate_per_ton,
    v_transport_charge,
    0::numeric,
    v_adjustment,
    v_total,
    round(v_total * 0.02, 2),
    round(v_total * 0.98, 2);
end;
$$;

notify pgrst, 'reload schema';