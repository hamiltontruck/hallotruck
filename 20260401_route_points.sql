-- Exposes plain lng/lat for pickup and dropoff so Edge Functions can pass
-- them straight to OpenRouteService without doing PostGIS math client-side.
create view order_route_points as
select
  id as order_id,
  driver_id,
  customer_id,
  st_x(pickup::geometry) as pickup_lng,
  st_y(pickup::geometry) as pickup_lat,
  st_x(dropoff::geometry) as dropoff_lng,
  st_y(dropoff::geometry) as dropoff_lat
from orders;

grant select on order_route_points to authenticated, service_role;
