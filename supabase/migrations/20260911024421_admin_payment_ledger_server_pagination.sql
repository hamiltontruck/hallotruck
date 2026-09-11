begin;

create index if not exists payments_event_created_at_desc_idx
  on public.payments (event, created_at desc, id desc);

create index if not exists payments_provider_ref_trgm_idx
  on public.payments using gin (provider_ref gin_trgm_ops);

create or replace function public.admin_payment_ledger_page(
  p_page integer default 1,
  p_page_size integer default 100,
  p_event text default null,
  p_search text default null
)
returns table (
  rows jsonb,
  total_count bigint,
  all_count bigint,
  status_counts jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := case when p_page_size = 50 then 50 else 100 end;
  v_event text := nullif(btrim(coalesce(p_event, '')), '');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  return query
  with base as materialized (
    select
      p.id,
      p.order_id,
      p.provider,
      p.provider_ref,
      p.amount_etb,
      p.event::text as event,
      p.receipt_path,
      p.raw_payload,
      p.created_at,
      o.tracking_id,
      o.customer_name,
      o.customer_phone,
      o.pickup_address,
      o.dropoff_address,
      o.price_etb,
      o.status as order_status,
      o.payment_status,
      o.driver_id,
      pr.full_name as driver_name,
      pr.phone as driver_phone
    from public.payments p
    left join public.orders o on o.id = p.order_id
    left join public.profiles pr on pr.id = o.driver_id
    where v_search is null
      or p.provider ilike '%' || v_search || '%'
      or coalesce(p.provider_ref, '') ilike '%' || v_search || '%'
      or p.event::text ilike '%' || v_search || '%'
      or p.amount_etb::text ilike '%' || v_search || '%'
      or coalesce(o.tracking_id, '') ilike '%' || v_search || '%'
      or coalesce(o.customer_name, '') ilike '%' || v_search || '%'
      or coalesce(o.customer_phone, '') ilike '%' || v_search || '%'
      or coalesce(o.pickup_address, '') ilike '%' || v_search || '%'
      or coalesce(o.dropoff_address, '') ilike '%' || v_search || '%'
      or coalesce(pr.full_name, '') ilike '%' || v_search || '%'
      or coalesce(pr.phone, '') ilike '%' || v_search || '%'
  ),
  selected as materialized (
    select *
    from base
    where v_event is null or v_event = 'all' or event = v_event
  ),
  page_rows as (
    select *
    from selected
    order by created_at desc, id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ),
  grouped as (
    select event, count(*)::bigint as count
    from base
    group by event
  )
  select
    coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
    (select count(*)::bigint from selected),
    (select count(*)::bigint from base),
    coalesce((select jsonb_object_agg(event, count) from grouped), '{}'::jsonb);
end;
$$;

revoke all on function public.admin_payment_ledger_page(integer, integer, text, text) from public, anon;
grant execute on function public.admin_payment_ledger_page(integer, integer, text, text) to authenticated;

commit;
