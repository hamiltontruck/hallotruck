-- Customer-owned cancellation with an auditable reason and safe truck release.
alter table public.orders
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancellation_source text;

alter table public.orders
  drop constraint if exists orders_cancellation_details_valid;

alter table public.orders
  add constraint orders_cancellation_details_valid check (
    status <> 'cancelled'::public.order_status
    or (
      cancelled_at is not null
      and cancelled_by is not null
      and cancellation_source in ('customer', 'admin', 'driver', 'system')
      and cancellation_reason is not null
      and char_length(btrim(cancellation_reason)) between 5 and 500
    )
  );

create index if not exists orders_driver_cancelled_at_idx
  on public.orders(driver_id, cancelled_at desc)
  where status = 'cancelled'::public.order_status and driver_id is not null;

create or replace function public.customer_cancel_order(
  p_order_id uuid,
  p_reason text
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
as $$
declare
  v_actor uuid := auth.uid();
  v_customer_id uuid;
  v_truck_id uuid;
  v_status public.order_status;
  v_reason text := nullif(btrim(p_reason), '');
  v_cancelled_at timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Customer sign-in is required';
  end if;

  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Write a cancellation reason of at least 5 characters';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'Cancellation reason must be 500 characters or fewer';
  end if;

  select o.customer_id, o.truck_id, o.status
    into v_customer_id, v_truck_id, v_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found or v_customer_id is distinct from v_actor then
    raise exception 'Order not found in your customer account';
  end if;

  if v_status = 'cancelled'::public.order_status then
    raise exception 'This order is already cancelled';
  end if;

  if v_status = 'delivered'::public.order_status then
    raise exception 'A delivered order cannot be cancelled';
  end if;

  if v_status not in (
    'quoted'::public.order_status,
    'placed'::public.order_status,
    'accepted'::public.order_status,
    'in_transit'::public.order_status
  ) then
    raise exception 'This order can no longer be cancelled';
  end if;

  update public.orders o
  set status = 'cancelled'::public.order_status,
      cancellation_reason = v_reason,
      cancelled_at = v_cancelled_at,
      cancelled_by = v_actor,
      cancellation_source = 'customer'
  where o.id = p_order_id;

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
$$;

revoke all on function public.customer_cancel_order(uuid, text) from public, anon;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;

comment on function public.customer_cancel_order(uuid, text) is
  'Atomically cancels a customer-owned order, records the reason, preserves assignment history, and releases the assigned truck.';

notify pgrst, 'reload schema';
