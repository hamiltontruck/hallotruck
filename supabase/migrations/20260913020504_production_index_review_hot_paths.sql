-- Production index review: evidence-backed hot paths only.
-- Applied and verified in production before this repository alignment change.
-- No business rows are inserted, updated, deleted, or backfilled.

create index if not exists orders_customer_id_created_at_idx
  on public.orders (customer_id, created_at desc, id desc);

create index if not exists orders_available_jobs_status_created_at_idx
  on public.orders (status, created_at asc, id asc)
  where driver_id is null;

create index if not exists driver_commission_charges_order_id_idx
  on public.driver_commission_charges (order_id);

-- Keep customers_created_at_idx, which has observed production scans.
-- These two were byte-for-byte duplicate btree(created_at desc) indexes
-- with zero observed scans at audit time and no constraint dependency.
drop index if exists public.customers_admin_intelligence_created_at_idx;
drop index if exists public.customers_created_at_desc_idx;
