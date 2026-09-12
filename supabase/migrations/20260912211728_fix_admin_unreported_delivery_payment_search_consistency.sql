begin;

-- Keep count/total and page-row search semantics identical for the leadership
-- unreported-payment queue, including driver identity and truck plate matches.
create or replace function public.admin_unreported_delivery_payment_page(
  p_page integer default 1,
  p_page_size integer default 100,
  p_search text default null,
  p_today boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page_size integer := case when p_page_size = 50 then 50 else 100 end;
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_total bigint := 0;
  v_total_pages integer := 1;
  v_invoice_total numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  with queue_rows as materialized (
    select
      o.id,
      o.tracking_id,
      o.customer_name,
      o.customer_phone,
      o.pickup_address,
      o.dropoff_address,
      o.cargo_description,
      o.vehicle_type,
      o.price_etb,
      o.status::text as status,
      o.payment_status::text as payment_status,
      o.driver_id,
      o.truck_id,
      o.accepted_at,
      o.delivered_at,
      o.cancellation_reason,
      o.cancellation_source,
      o.cancelled_at,
      o.created_at,
      coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.phone), '')) as driver_name,
      nullif(btrim(t.plate_number), '') as plate_number
    from public.orders o
    left join public.profiles pr on pr.id = o.driver_id
    left join public.trucks t on t.id = o.truck_id
    where o.status = 'delivered'
      and o.payment_status = 'unpaid'
      and o.payment_terms = 'pay_driver_on_delivery'
      and o.delivered_at >= '2026-08-28T18:15:40.000Z'::timestamptz
      and not exists (
        select 1 from public.driver_trip_payment_results r where r.order_id = o.id
      )
      and (
        v_search is null
        or concat_ws(' ', o.tracking_id, o.customer_name, o.customer_phone, o.pickup_address, o.dropoff_address, o.vehicle_type, o.cargo_description, pr.full_name, pr.phone, t.plate_number)
          ilike '%' || v_search || '%'
      )
      and (
        not coalesce(p_today, false)
        or (o.delivered_at at time zone 'Africa/Addis_Ababa')::date = (now() at time zone 'Africa/Addis_Ababa')::date
      )
  )
  select count(*)::bigint, coalesce(sum(greatest(coalesce(price_etb, 0), 0)), 0)::numeric
  into v_total, v_invoice_total
  from queue_rows;

  v_total_pages := greatest(1, ceil(v_total::numeric / v_page_size)::integer);
  v_page := least(v_page, v_total_pages);

  with queue_rows as materialized (
    select
      o.id,
      o.tracking_id,
      o.customer_name,
      o.customer_phone,
      o.pickup_address,
      o.dropoff_address,
      o.cargo_description,
      o.vehicle_type,
      o.price_etb,
      o.status::text as status,
      o.payment_status::text as payment_status,
      o.driver_id,
      o.truck_id,
      o.accepted_at,
      o.delivered_at,
      o.cancellation_reason,
      o.cancellation_source,
      o.cancelled_at,
      o.created_at,
      coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.phone), '')) as driver_name,
      nullif(btrim(t.plate_number), '') as plate_number
    from public.orders o
    left join public.profiles pr on pr.id = o.driver_id
    left join public.trucks t on t.id = o.truck_id
    where o.status = 'delivered'
      and o.payment_status = 'unpaid'
      and o.payment_terms = 'pay_driver_on_delivery'
      and o.delivered_at >= '2026-08-28T18:15:40.000Z'::timestamptz
      and not exists (
        select 1 from public.driver_trip_payment_results r where r.order_id = o.id
      )
      and (
        v_search is null
        or concat_ws(' ', o.tracking_id, o.customer_name, o.customer_phone, o.pickup_address, o.dropoff_address, o.vehicle_type, o.cargo_description, pr.full_name, pr.phone, t.plate_number)
          ilike '%' || v_search || '%'
      )
      and (
        not coalesce(p_today, false)
        or (o.delivered_at at time zone 'Africa/Addis_Ababa')::date = (now() at time zone 'Africa/Addis_Ababa')::date
      )
    order by o.delivered_at desc nulls last, o.id desc
    limit v_page_size
    offset (v_page - 1) * v_page_size
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'tracking_id', tracking_id,
      'customer_name', customer_name,
      'customer_phone', customer_phone,
      'pickup_address', pickup_address,
      'dropoff_address', dropoff_address,
      'cargo_description', coalesce(nullif(btrim(cargo_description), ''), vehicle_type),
      'vehicle_type', vehicle_type,
      'price_etb', price_etb,
      'status', status,
      'payment_status', payment_status,
      'driver_id', driver_id,
      'truck_id', truck_id,
      'driver_name', driver_name,
      'plate_number', plate_number,
      'assignment_label', case
        when driver_name is not null or plate_number is not null then coalesce(driver_name, 'Driver profile unavailable') || ' · ' || coalesce(plate_number, 'Plate unavailable')
        else 'Driver and truck not assigned'
      end,
      'accepted_at', accepted_at,
      'delivered_at', delivered_at,
      'cancellation_reason', cancellation_reason,
      'cancellation_source', cancellation_source,
      'cancelled_at', cancelled_at,
      'created_at', created_at
    ) order by delivered_at desc nulls last, id desc
  ), '[]'::jsonb)
  into v_rows
  from queue_rows;

  return jsonb_build_object(
    'queue', 'unreported-payment',
    'page', v_page,
    'pageSize', v_page_size,
    'total', v_total,
    'totalPages', v_total_pages,
    'invoiceTotal', v_invoice_total,
    'statusCounts', jsonb_build_object('all', v_total, 'delivered', v_total),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_unreported_delivery_payment_page(integer, integer, text, boolean) from public, anon;
grant execute on function public.admin_unreported_delivery_payment_page(integer, integer, text, boolean) to authenticated;

commit;
