create index if not exists payments_legacy_completed_released_order_idx
  on public.payments (order_id)
  where event = 'released' and raw_payload @> '{"legacy_completed": true}'::jsonb;

create or replace function public.admin_order_control_queue_page(
  p_queue text,
  p_page integer default 1,
  p_page_size integer default 100,
  p_status text default 'all',
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
  v_rows jsonb := '[]'::jsonb;
  v_status_counts jsonb := '{}'::jsonb;
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  if p_queue not in ('delayed', 'unassigned', 'delayed-or-unassigned', 'missing-evidence') then
    raise exception 'Unsupported Admin order queue: %', p_queue using errcode = '22023';
  end if;

  with queue_rows as materialized (
    select o.*
    from public.orders o
    where
      case p_queue
        when 'delayed' then
          o.status in ('accepted', 'in_transit')
          and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours'
        when 'unassigned' then
          o.status not in ('delivered', 'cancelled')
          and (o.driver_id is null or o.truck_id is null)
        when 'delayed-or-unassigned' then
          (
            o.status in ('accepted', 'in_transit')
            and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours'
          )
          or (
            o.status not in ('delivered', 'cancelled')
            and (o.driver_id is null or o.truck_id is null)
          )
        when 'missing-evidence' then
          o.status = 'delivered'
          and not exists (
            select 1 from public.delivery_proofs dp where dp.order_id = o.id
          )
          and not exists (
            select 1
            from public.payments p
            where p.order_id = o.id
              and p.event = 'released'
              and p.raw_payload @> '{"legacy_completed": true}'::jsonb
          )
        else false
      end
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', o.tracking_id, o.customer_name, o.customer_phone, o.pickup_address, o.dropoff_address, o.vehicle_type, o.cargo_description)
          ilike '%' || btrim(p_search) || '%'
      )
      and (
        not coalesce(p_today, false)
        or (
          (case when o.status = 'delivered' and o.delivered_at is not null then o.delivered_at else o.created_at end)
          at time zone 'Africa/Addis_Ababa'
        )::date = (now() at time zone 'Africa/Addis_Ababa')::date
      )
  )
  select jsonb_build_object(
    'all', count(*),
    'quoted', count(*) filter (where status::text = 'quoted'),
    'placed', count(*) filter (where status::text = 'placed'),
    'accepted', count(*) filter (where status::text = 'accepted'),
    'in_transit', count(*) filter (where status::text = 'in_transit'),
    'delivered', count(*) filter (where status::text = 'delivered'),
    'cancelled', count(*) filter (where status::text = 'cancelled')
  )
  into v_status_counts
  from queue_rows;

  with queue_rows as materialized (
    select o.id, o.status
    from public.orders o
    where
      case p_queue
        when 'delayed' then o.status in ('accepted', 'in_transit') and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours'
        when 'unassigned' then o.status not in ('delivered', 'cancelled') and (o.driver_id is null or o.truck_id is null)
        when 'delayed-or-unassigned' then
          (o.status in ('accepted', 'in_transit') and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours')
          or (o.status not in ('delivered', 'cancelled') and (o.driver_id is null or o.truck_id is null))
        when 'missing-evidence' then
          o.status = 'delivered'
          and not exists (select 1 from public.delivery_proofs dp where dp.order_id = o.id)
          and not exists (
            select 1 from public.payments p
            where p.order_id = o.id and p.event = 'released' and p.raw_payload @> '{"legacy_completed": true}'::jsonb
          )
        else false
      end
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', o.tracking_id, o.customer_name, o.customer_phone, o.pickup_address, o.dropoff_address, o.vehicle_type, o.cargo_description)
          ilike '%' || btrim(p_search) || '%'
      )
      and (
        not coalesce(p_today, false)
        or ((case when o.status = 'delivered' and o.delivered_at is not null then o.delivered_at else o.created_at end) at time zone 'Africa/Addis_Ababa')::date
          = (now() at time zone 'Africa/Addis_Ababa')::date
      )
      and (coalesce(p_status, 'all') = 'all' or o.status::text = p_status)
  )
  select count(*) into v_total from queue_rows;

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
    where
      case p_queue
        when 'delayed' then o.status in ('accepted', 'in_transit') and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours'
        when 'unassigned' then o.status not in ('delivered', 'cancelled') and (o.driver_id is null or o.truck_id is null)
        when 'delayed-or-unassigned' then
          (o.status in ('accepted', 'in_transit') and coalesce(o.accepted_at, o.created_at) < now() - interval '48 hours')
          or (o.status not in ('delivered', 'cancelled') and (o.driver_id is null or o.truck_id is null))
        when 'missing-evidence' then
          o.status = 'delivered'
          and not exists (select 1 from public.delivery_proofs dp where dp.order_id = o.id)
          and not exists (
            select 1 from public.payments p
            where p.order_id = o.id and p.event = 'released' and p.raw_payload @> '{"legacy_completed": true}'::jsonb
          )
        else false
      end
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', o.tracking_id, o.customer_name, o.customer_phone, o.pickup_address, o.dropoff_address, o.vehicle_type, o.cargo_description)
          ilike '%' || btrim(p_search) || '%'
      )
      and (
        not coalesce(p_today, false)
        or ((case when o.status = 'delivered' and o.delivered_at is not null then o.delivered_at else o.created_at end) at time zone 'Africa/Addis_Ababa')::date
          = (now() at time zone 'Africa/Addis_Ababa')::date
      )
      and (coalesce(p_status, 'all') = 'all' or o.status::text = p_status)
    order by o.created_at desc, o.id desc
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
    ) order by created_at desc, id desc
  ), '[]'::jsonb)
  into v_rows
  from queue_rows;

  return jsonb_build_object(
    'queue', p_queue,
    'page', v_page,
    'pageSize', v_page_size,
    'total', v_total,
    'totalPages', v_total_pages,
    'statusCounts', v_status_counts,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_order_control_queue_page(text, integer, integer, text, text, boolean) from public;
revoke all on function public.admin_order_control_queue_page(text, integer, integer, text, text, boolean) from anon;
grant execute on function public.admin_order_control_queue_page(text, integer, integer, text, text, boolean) to authenticated;
