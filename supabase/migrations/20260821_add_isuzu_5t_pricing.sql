begin;

insert into public.quote_pricing_rules (
  vehicle_key,
  vehicle_type,
  sort_order,
  rate_per_km,
  rate_per_ton,
  base_fee_etb,
  minimum_fare_etb,
  market_adjustment_percent,
  rate_per_ton_km,
  active,
  updated_at
)
select
  'isuzu 5 ton',
  'Isuzu 5 Ton',
  25,
  v.rate_per_km,
  v.rate_per_ton,
  0,
  0,
  v.market_adjustment_percent,
  v.rate_per_ton_km,
  true,
  now()
from public.quote_pricing_rules v
where v.vehicle_key = 'van'
on conflict (vehicle_key) do update
set vehicle_type = excluded.vehicle_type,
    sort_order = excluded.sort_order,
    active = true;

commit;
