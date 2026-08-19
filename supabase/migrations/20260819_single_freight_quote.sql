begin;

do $block$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.quote_pricing_rules'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%minimum_fare_etb%'
  loop
    execute format('alter table public.quote_pricing_rules drop constraint %I', v_constraint);
  end loop;
end;
$block$;

alter table public.quote_pricing_rules
  add constraint quote_pricing_rules_minimum_fare_nonnegative
  check (minimum_fare_etb >= 0);

update public.quote_pricing_rules
set base_fee_etb = 0,
    minimum_fare_etb = 0,
    updated_at = now()
where base_fee_etb <> 0
   or minimum_fare_etb <> 0;

comment on column public.quote_pricing_rules.base_fee_etb is
  'Deprecated compatibility column. Customer freight quotes do not add a base fee.';
comment on column public.quote_pricing_rules.minimum_fare_etb is
  'Deprecated compatibility column. Customer freight quotes do not apply a minimum fare.';

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
  v_adjustment := round(v_transport_charge * v_rule.market_adjustment_percent / 100.0, 2);
  v_total := greatest(0, round((v_transport_charge + v_adjustment) / 50.0) * 50.0);

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
    0::numeric,
    v_adjustment,
    v_total,
    round(v_total * 0.02, 2),
    round(v_total * 0.98, 2);
end;
$function$;

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
      base_fee_etb = 0,
      minimum_fare_etb = 0,
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

commit;
