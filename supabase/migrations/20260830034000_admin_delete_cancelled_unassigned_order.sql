-- Issue #184: permanently delete only cancelled, never-assigned orders with no financial or audit history.
-- The RPC is the only supported delete path; operational child rows may cascade only after every immutable-history guard passes.

begin;

create or replace function public.admin_delete_cancelled_order(
  p_order_id uuid
)
returns table (
  deleted_order_id uuid,
  deleted_tracking_id text,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status public.order_status;
  v_driver_id uuid;
  v_truck_id uuid;
  v_accepted_at timestamptz;
  v_delivered_at timestamptz;
  v_payment_status public.payment_status;
  v_payment_provider text;
  v_payment_ref text;
  v_tracking_id text;
  v_deleted_at timestamptz := now();
begin
  perform private.require_active_leadership(
    'admin_delete_cancelled_order'
  );

  select
    trip_order.status,
    trip_order.driver_id,
    trip_order.truck_id,
    trip_order.accepted_at,
    trip_order.delivered_at,
    trip_order.payment_status,
    trip_order.payment_provider,
    trip_order.payment_ref,
    trip_order.tracking_id
  into
    v_status,
    v_driver_id,
    v_truck_id,
    v_accepted_at,
    v_delivered_at,
    v_payment_status,
    v_payment_provider,
    v_payment_ref,
    v_tracking_id
  from public.orders trip_order
  where trip_order.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.'
      using errcode = 'P0002';
  end if;

  if v_status <> 'cancelled'::public.order_status then
    raise exception 'Only cancelled orders can be permanently deleted.'
      using errcode = '23514';
  end if;

  if v_driver_id is not null or v_truck_id is not null then
    raise exception 'Assigned orders cannot be permanently deleted.'
      using errcode = '23514';
  end if;

  if v_accepted_at is not null or v_delivered_at is not null then
    raise exception 'Orders with trip history cannot be permanently deleted.'
      using errcode = '23514';
  end if;

  if v_payment_status <> 'unpaid'::public.payment_status
    or nullif(btrim(coalesce(v_payment_provider, '')), '') is not null
    or nullif(btrim(coalesce(v_payment_ref, '')), '') is not null
  then
    raise exception 'Orders with payment state cannot be permanently deleted.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.payments item where item.order_id = p_order_id
  ) or exists (
    select 1 from private.payment_reference_registry item
    where item.canonical_order_id = p_order_id
  ) or exists (
    select 1 from public.payment_review_audit item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.financial_corrections item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.delivery_proofs item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.driver_commission_charges item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.driver_payment_confirmation_events item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.driver_payment_confirmations item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.driver_trip_payment_results item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.partner_freight_earnings item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.ratings item where item.order_id = p_order_id
  ) or exists (
    select 1 from public.notifications item
    where item.data ->> 'order_id' = p_order_id::text
  ) or exists (
    select 1 from public.driver_commission_audit item
    where item.details ->> 'order_id' = p_order_id::text
  ) or exists (
    select 1 from public.partner_activity_log item
    where item.metadata ->> 'order_id' = p_order_id::text
  ) or exists (
    select 1 from public.partner_settlement_events item
    where item.metadata ->> 'order_id' = p_order_id::text
  ) or exists (
    select 1 from public.fleet_audit_events item
    where item.old_values ->> 'order_id' = p_order_id::text
       or item.new_values ->> 'order_id' = p_order_id::text
  ) then
    raise exception 'Order has linked financial or audit history and cannot be deleted.'
      using errcode = '23503';
  end if;

  -- Safe operational-only children such as cancelled dispatch requests and
  -- pre-trip tracking rows follow their existing ON DELETE CASCADE contracts.
  delete from public.orders trip_order
  where trip_order.id = p_order_id;

  if not found then
    raise exception 'Order could not be deleted.';
  end if;

  return query
  select p_order_id, v_tracking_id, v_deleted_at;
end;
$function$;

revoke delete, truncate, references, trigger
  on table public.orders
  from public, anon, authenticated;

revoke all on function public.admin_delete_cancelled_order(uuid)
  from public, anon;
grant execute on function public.admin_delete_cancelled_order(uuid)
  to authenticated;

comment on function public.admin_delete_cancelled_order(uuid) is
  'Active Admin/CEO-only permanent deletion for cancelled, never-assigned, unpaid orders without financial, delivery, commission, settlement, rating, notification, or audit history.';

notify pgrst, 'reload schema';

commit;
