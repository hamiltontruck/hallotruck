-- Complete Admin Orders scalability with one database-side pagination/search/count RPC.
-- No production order rows are inserted, updated, deleted, or backfilled.

create index if not exists orders_delivered_at_desc_idx
  on public.orders (delivered_at desc, id desc)
  where status = 'delivered'::public.order_status;

create or replace function public.admin_orders_page(
  p_page integer default 1,
  p_page_size integer default 100,
  p_status text default 'all',
  p_search text default null,
  p_today boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with input as (
  select
    greatest(coalesce(p_page, 1), 1) as requested_page,
    case when p_page_size = 50 then 50 else 100 end as page_size,
    case when coalesce(nullif(trim(p_status), ''), 'all') in ('quoted','placed','accepted','in_transit','delivered','cancelled')
      then coalesce(nullif(trim(p_status), ''), 'all') else 'all' end as selected_status,
    nullif(trim(p_search), '') as search_term,
    coalesce(p_today, false) as today_only,
    (date_trunc('day', timezone('Africa/Addis_Ababa', now())) at time zone 'Africa/Addis_Ababa') as day_start,
    ((date_trunc('day', timezone('Africa/Addis_Ababa', now())) + interval '1 day') at time zone 'Africa/Addis_Ababa') as day_end
),
base as (
  select
    o.id,
    o.tracking_id,
    o.customer_name,
    o.customer_phone,
    o.pickup_address,
    o.dropoff_address,
    coalesce(nullif(trim(o.cargo_description), ''), o.vehicle_type) as cargo_description,
    o.vehicle_type,
    o.price_etb,
    o.status,
    o.payment_status,
    o.driver_id,
    o.truck_id,
    p.full_name as driver_name,
    t.plate_number,
    case
      when coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.phone), ''), nullif(trim(t.plate_number), '')) is null
        then 'Driver and truck not assigned'
      else concat(
        coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.phone), ''), 'Driver profile unavailable'),
        ' · ',
        coalesce(nullif(trim(t.plate_number), ''), 'Plate unavailable')
      )
    end as assignment_label,
    o.accepted_at,
    o.delivered_at,
    o.cancellation_reason,
    o.cancellation_source,
    o.cancelled_at,
    o.created_at
  from public.orders o
  cross join input i
  left join public.profiles p on p.id = o.driver_id
  left join public.trucks t on t.id = o.truck_id
  where
    (
      not i.today_only
      or (
        o.status = 'delivered'::public.order_status
        and o.delivered_at >= i.day_start
        and o.delivered_at < i.day_end
      )
      or (
        o.status <> 'delivered'::public.order_status
        and o.created_at >= i.day_start
        and o.created_at < i.day_end
      )
    )
    and (
      i.search_term is null
      or o.tracking_id ilike '%' || i.search_term || '%'
      or o.customer_name ilike '%' || i.search_term || '%'
      or o.customer_phone ilike '%' || i.search_term || '%'
      or o.pickup_address ilike '%' || i.search_term || '%'
      or o.dropoff_address ilike '%' || i.search_term || '%'
      or o.vehicle_type ilike '%' || i.search_term || '%'
      or o.cargo_description ilike '%' || i.search_term || '%'
    )
),
selected as (
  select b.*
  from base b
  cross join input i
  where i.selected_status = 'all' or b.status::text = i.selected_status
),
counts as (
  select status::text as status, count(*)::bigint as count
  from base
  group by status
),
meta as (
  select
    count(*)::bigint as total,
    greatest(1, ceil(count(*)::numeric / i.page_size)::integer) as total_pages,
    i.page_size,
    i.requested_page
  from selected
  cross join input i
  group by i.page_size, i.requested_page
),
page_meta as (
  select total, total_pages, page_size, least(requested_page, total_pages) as page
  from meta
),
paged as (
  select s.*
  from selected s
  cross join page_meta m
  order by s.created_at desc, s.id desc
  limit (select page_size from page_meta)
  offset ((select page from page_meta) - 1) * (select page_size from page_meta)
)
select jsonb_build_object(
  'page', m.page,
  'pageSize', m.page_size,
  'total', m.total,
  'totalPages', m.total_pages,
  'statusCounts',
    coalesce((select jsonb_object_agg(c.status, c.count) from counts c), '{}'::jsonb)
      || jsonb_build_object('all', (select count(*)::bigint from base)),
  'rows', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from paged p), '[]'::jsonb)
)
from page_meta m;
$$;

revoke all on function public.admin_orders_page(integer, integer, text, text, boolean) from public;
grant execute on function public.admin_orders_page(integer, integer, text, text, boolean) to authenticated;
