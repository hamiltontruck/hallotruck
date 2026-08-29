-- Admin Manage Order cancellation control.
-- This preserves order/payment history while removing the order from active dispatch.

begin;

create or replace function public.admin_cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns table(
  order_id uuid,
  status public.order_status,
  cancellation_reason text,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status public.order_status;
  v_truck_id uuid;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Cancelled by Admin from Manage Order.');
  v_cancelled_at timestamptz := now();
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  if char_length(v_reason) < 5 then
    raise exception 'Cancellation reason must be at least 5 characters';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'Cancellation reason must be 500 characters or fewer';
  end if;

  select trip_order.status, trip_order.truck_id
    into v_status, v_truck_id
  from public.orders trip_order
  where trip_order.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_status = 'cancelled'::public.order_status then
    raise exception 'This order is already cancelled';
  end if;

  if v_status = 'delivered'::public.order_status then
    raise exception 'Delivered orders must be corrected from Finance instead of cancelled';
  end if;

  if v_status not in (
    'quoted'::public.order_status,
    'placed'::public.order_status,
    'accepted'::public.order_status,
    'in_transit'::public.order_status
  ) then
    raise exception 'This order can no longer be cancelled';
  end if;

  update public.orders trip_order
  set status = 'cancelled'::public.order_status,
      cancellation_reason = v_reason,
      cancelled_at = v_cancelled_at,
      cancelled_by = v_actor,
      cancellation_source = 'admin'
  where trip_order.id = p_order_id;

  update public.customer_dispatch_requests request
  set status = 'cancelled',
      updated_at = v_cancelled_at
  where request.order_id = p_order_id
    and request.status in ('requested', 'approved');

  if v_truck_id is not null then
    update public.trucks truck
    set status = 'available',
        driver_id = null,
        updated_at = v_cancelled_at
    where truck.id = v_truck_id
      and truck.status = 'assigned'
      and not exists (
        select 1
        from public.orders active_order
        where active_order.id <> p_order_id
          and active_order.truck_id = v_truck_id
          and active_order.status in (
            'accepted'::public.order_status,
            'in_transit'::public.order_status
          )
      );
  end if;

  return query
  select
    p_order_id,
    'cancelled'::public.order_status,
    v_reason,
    v_cancelled_at;
end;
$function$;

revoke all on function public.admin_cancel_order(uuid, text) from public, anon;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;

comment on function public.admin_cancel_order(uuid, text) is
  'Admin/CEO-only order cancellation from Manage Order. Preserves financial history, records reason, closes dispatch requests, and releases the assigned truck when no other active trip uses it.';

notify pgrst, 'reload schema';

commit;
