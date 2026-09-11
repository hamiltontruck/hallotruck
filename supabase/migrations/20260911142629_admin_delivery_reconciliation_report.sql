create index if not exists orders_status_delivered_at_desc_idx
  on public.orders (status, delivered_at desc, id desc);

create index if not exists driver_trip_payment_results_order_id_idx
  on public.driver_trip_payment_results (order_id);

create or replace function public.admin_delivery_reconciliation_report(
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := case when coalesce(p_page_size, 50) = 100 then 100 else 50 end;
  v_total bigint := 0;
  v_summary jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  with classified as (
    select
      o.id,
      o.tracking_id,
      o.pickup_address,
      o.dropoff_address,
      o.delivered_at,
      exists(select 1 from public.delivery_proofs dp where dp.order_id = o.id) as has_proof,
      exists(select 1 from public.driver_trip_payment_results pr where pr.order_id = o.id) as has_trip_payment_result
    from public.orders o
    where o.status = 'delivered'
  ), labeled as (
    select *,
      (not has_proof) as missing_proof,
      (not has_trip_payment_result) as missing_trip_payment_result,
      (
        ((not has_proof) and (delivered_at is null or delivered_at >= timestamptz '2026-08-16T18:17:11.000Z'))
        or
        ((not has_trip_payment_result) and (delivered_at is null or delivered_at >= timestamptz '2026-08-28T18:15:40.000Z'))
      ) as current_workflow_defect
    from classified
  ), final as (
    select *,
      (missing_proof or missing_trip_payment_result) as anomaly,
      ((missing_proof or missing_trip_payment_result) and not current_workflow_defect) as legitimate_legacy
    from labeled
  )
  select jsonb_build_object(
    'deliveredTotal', count(*),
    'anomalyTotal', count(*) filter (where anomaly),
    'deliveredWithoutProof', count(*) filter (where missing_proof),
    'deliveredWithoutTripPaymentResult', count(*) filter (where missing_trip_payment_result),
    'legitimateLegacy', count(*) filter (where legitimate_legacy),
    'currentWorkflowDefects', count(*) filter (where current_workflow_defect)
  ), count(*) filter (where anomaly)
  into v_summary, v_total
  from final;

  with classified as (
    select
      o.id,
      o.tracking_id,
      o.pickup_address,
      o.dropoff_address,
      o.delivered_at,
      exists(select 1 from public.delivery_proofs dp where dp.order_id = o.id) as has_proof,
      exists(select 1 from public.driver_trip_payment_results pr where pr.order_id = o.id) as has_trip_payment_result
    from public.orders o
    where o.status = 'delivered'
  ), labeled as (
    select *,
      (not has_proof) as missing_proof,
      (not has_trip_payment_result) as missing_trip_payment_result,
      (
        ((not has_proof) and (delivered_at is null or delivered_at >= timestamptz '2026-08-16T18:17:11.000Z'))
        or
        ((not has_trip_payment_result) and (delivered_at is null or delivered_at >= timestamptz '2026-08-28T18:15:40.000Z'))
      ) as current_workflow_defect
    from classified
  ), final as (
    select *,
      (missing_proof or missing_trip_payment_result) as anomaly,
      ((missing_proof or missing_trip_payment_result) and not current_workflow_defect) as legitimate_legacy
    from labeled
  ), page_rows as (
    select *
    from final
    where anomaly
    order by delivered_at desc nulls last, id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'tracking_id', tracking_id,
    'pickup_address', pickup_address,
    'dropoff_address', dropoff_address,
    'delivered_at', delivered_at,
    'hasProof', has_proof,
    'hasTripPaymentResult', has_trip_payment_result,
    'missingProof', missing_proof,
    'missingTripPaymentResult', missing_trip_payment_result,
    'currentWorkflowDefect', current_workflow_defect,
    'legitimateLegacy', legitimate_legacy
  ) order by delivered_at desc nulls last, id desc), '[]'::jsonb)
  into v_rows
  from page_rows;

  if v_page > greatest(1, ceil(v_total::numeric / v_page_size)::integer) then
    v_page := greatest(1, ceil(v_total::numeric / v_page_size)::integer);
  end if;

  return jsonb_build_object(
    'summary', v_summary,
    'page', v_page,
    'pageSize', v_page_size,
    'total', v_total,
    'totalPages', greatest(1, ceil(v_total::numeric / v_page_size)::integer),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_delivery_reconciliation_report(integer, integer) from public, anon;
grant execute on function public.admin_delivery_reconciliation_report(integer, integer) to authenticated;
