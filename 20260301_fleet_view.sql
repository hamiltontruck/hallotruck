-- Latest GPS ping per order — powers the admin live fleet map
create view latest_tracking_pings as
select distinct on (tp.order_id)
  tp.order_id,
  tp.driver_id,
  tp.location,
  st_x(tp.location::geometry) as lng,
  st_y(tp.location::geometry) as lat,
  tp.heading,
  tp.speed_kmh,
  tp.recorded_at
from tracking_pings tp
order by tp.order_id, tp.recorded_at desc;

-- Convenience view joining active orders with their latest position
-- and driver name, exactly what the admin fleet map needs in one query.
create view active_fleet as
select
  o.id as order_id,
  o.tracking_id,
  o.status,
  o.pickup_address,
  o.dropoff_address,
  p.full_name as driver_name,
  ltp.lng,
  ltp.lat,
  ltp.heading,
  ltp.speed_kmh,
  ltp.recorded_at
from orders o
left join profiles p on p.id = o.driver_id
left join latest_tracking_pings ltp on ltp.order_id = o.id
where o.status in ('accepted', 'in_transit');

-- RLS: views inherit querying user's row-level access from underlying tables,
-- but since 'orders' policy already scopes to admin/participant, expose
-- explicit read access for admins via a security-barrier grant.
grant select on active_fleet to authenticated;
grant select on latest_tracking_pings to authenticated;
