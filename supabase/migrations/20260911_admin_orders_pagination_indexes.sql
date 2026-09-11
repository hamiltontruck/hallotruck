-- Support Admin Orders server-side pagination and broad operational search.
-- No production rows are changed by this migration.

create extension if not exists pg_trgm;

create index if not exists orders_created_at_desc_idx
  on public.orders (created_at desc, id desc);

create index if not exists orders_status_created_at_desc_idx
  on public.orders (status, created_at desc, id desc);

create index if not exists orders_tracking_id_trgm_idx
  on public.orders using gin (tracking_id gin_trgm_ops);

create index if not exists orders_customer_name_trgm_idx
  on public.orders using gin (customer_name gin_trgm_ops);

create index if not exists orders_customer_phone_trgm_idx
  on public.orders using gin (customer_phone gin_trgm_ops);

create index if not exists orders_pickup_address_trgm_idx
  on public.orders using gin (pickup_address gin_trgm_ops);

create index if not exists orders_dropoff_address_trgm_idx
  on public.orders using gin (dropoff_address gin_trgm_ops);

create index if not exists orders_vehicle_type_trgm_idx
  on public.orders using gin (vehicle_type gin_trgm_ops);

create index if not exists orders_cargo_description_trgm_idx
  on public.orders using gin (cargo_description gin_trgm_ops);
