begin;

with new_trucks(vehicle_key, vehicle_type, sort_order) as (
  values
    ('truck 22 ton', 'Truck 22 Ton', 70),
    ('truck 25 ton', 'Truck 25 Ton', 80),
    ('truck 30 ton', 'Truck 30 Ton', 90)
)
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
  n.vehicle_key,
  n.vehicle_type,
  n.sort_order,
  trailer.rate_per_km,
  trailer.rate_per_ton,
  0,
  0,
  0,
  22.222222,
  true,
  now()
from new_trucks n
cross join public.quote_pricing_rules trailer
where trailer.vehicle_key = 'trailer'
on conflict (vehicle_key) do update
set vehicle_type = excluded.vehicle_type,
    sort_order = excluded.sort_order,
    base_fee_etb = 0,
    minimum_fare_etb = 0,
    active = true,
    updated_at = now();

commit;
