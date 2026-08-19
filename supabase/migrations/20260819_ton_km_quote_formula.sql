begin;

alter table public.quote_pricing_rules
  add column if not exists rate_per_ton_km numeric(14,6);

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quote_pricing_rules_rate_per_ton_km_check'
      and conrelid = 'public.quote_pricing_rules'::regclass
  ) then
    alter table public.quote_pricing_rules
      add constraint quote_pricing_rules_rate_per_ton_km_check
      check (rate_per_ton_km is null or rate_per_ton_km > 0);
  end if;
end;
$block$;

comment on column public.quote_pricing_rules.rate_per_ton_km is
  'ETB charged for one ton moved one kilometre. When null, the legacy additive rule remains active until an Admin saves a ton-km rate.';

create or replace function public.get_quote_pricing_rules_v2()
returns table (
  vehicle_key text,
  vehicle_type text,
  rate_per_ton_km numeric,
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
    r.rate_per_ton_km,
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

revoke all on function public.get_quote_pricing_rules_v2() from public, anon;
grant execute on function public.get_quote_pricing_rules_v2() to authenticated;

create or replace function public.calculate_transport_quote_v2(
  p_distance_km numeric,
  p_vehicle_type text,
  p_cargo_tons numeric
)
returns table (
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
as $function$
declare
  v_rule public.quote_pricing_rules%rowtype;
  v_formula text;
  v_ton_km numeric;
  v_effective_rate numeric;
  v_transport_charge numeric;
  v_route_rate_per_ton numeric;
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

  v_ton_km := p_distance_km * p_cargo_tons;

  if v_rule.rate_per_ton_km is not null and v_rule.rate_per_ton_km > 0 then
    v_formula := 'ton_km';
    v_effective_rate := v_rule.rate_per_ton_km;
    v_transport_charge := round(v_ton_km * v_effective_rate, 2);
  else
    v_formula := 'legacy';
    v_transport_charge := round(
      (p_distance_km * v_rule.rate_per_km)
      + (p_cargo_tons * v_rule.rate_per_ton),
      2
    );
    v_effective_rate := round(v_transport_charge / v_ton_km, 6);
  end if;

  v_route_rate_per_ton := round(v_transport_charge / p_cargo_tons, 2);
  v_subtotal := v_rule.base_fee_etb + v_transport_charge;
  v_adjustment := round(v_subtotal * v_rule.market_adjustment_percent / 100.0, 2);
  v_total := greatest(
    v_rule.minimum_fare_etb,
    round((v_subtotal + v_adjustment) / 50.0) * 50.0
  );

  return query
  select
    v_rule.vehicle_type,
    v_formula,
    round(p_distance_km, 2),
    round(p_cargo_tons, 3),
    round(v_ton_km, 3),
    v_effective_rate,
    v_route_rate_per_ton,
    v_transport_charge,
    v_rule.base_fee_etb,
    v_adjustment,
    v_total,
    round(v_total * 0.02, 2),
    round(v_total * 0.98, 2);
end;
$function$;

revoke all on function public.calculate_transport_quote_v2(numeric, text, numeric) from public, anon;
grant execute on function public.calculate_transport_quote_v2(numeric, text, numeric) to authenticated;

create or replace function public.admin_update_quote_pricing_rule_v2(
  p_vehicle_key text,
  p_rate_per_ton_km numeric,
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

  if p_rate_per_ton_km is null or p_rate_per_ton_km <= 0 then
    raise exception 'Rate per ton-kilometre must be greater than zero';
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
  set rate_per_ton_km = round(p_rate_per_ton_km, 6),
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

revoke all on function public.admin_update_quote_pricing_rule_v2(text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_update_quote_pricing_rule_v2(text, numeric, numeric, numeric, numeric) to authenticated;

commit;
