create or replace function public.enforce_verified_payment_before_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_check boolean;
begin
  if tg_op = 'INSERT' then
    v_requires_check := new.driver_id is not null
      or new.truck_id is not null
      or new.status in ('accepted'::public.order_status, 'in_transit'::public.order_status, 'delivered'::public.order_status);
  else
    v_requires_check :=
      (old.driver_id is null and new.driver_id is not null)
      or (old.truck_id is null and new.truck_id is not null)
      or (old.status = 'placed'::public.order_status and new.status in ('accepted'::public.order_status, 'in_transit'::public.order_status, 'delivered'::public.order_status));
  end if;

  if v_requires_check and not public.order_payment_ready_for_dispatch(new.id) then
    raise exception 'Customer payment must be verified in full before dispatch';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_verified_payment_dispatch_guard on public.orders;
drop trigger if exists orders_verified_payment_dispatch_guard_insert on public.orders;
drop trigger if exists orders_verified_payment_dispatch_guard_update on public.orders;
create trigger orders_verified_payment_dispatch_guard_insert
before insert
on public.orders
for each row
execute function public.enforce_verified_payment_before_dispatch();
create trigger orders_verified_payment_dispatch_guard_update
before update of driver_id, truck_id, status
on public.orders
for each row
execute function public.enforce_verified_payment_before_dispatch();

create or replace function public.enforce_verified_payment_before_dispatch_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'requested' and not public.order_payment_ready_for_dispatch(new.order_id) then
    raise exception 'Customer payment must be verified in full before requesting a truck';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_dispatch_verified_payment_guard on public.customer_dispatch_requests;
drop trigger if exists customer_dispatch_verified_payment_guard_insert on public.customer_dispatch_requests;
drop trigger if exists customer_dispatch_verified_payment_guard_update on public.customer_dispatch_requests;
create trigger customer_dispatch_verified_payment_guard_insert
before insert
on public.customer_dispatch_requests
for each row
execute function public.enforce_verified_payment_before_dispatch_request();
create trigger customer_dispatch_verified_payment_guard_update
before update of order_id, status
on public.customer_dispatch_requests
for each row
execute function public.enforce_verified_payment_before_dispatch_request();

update public.customer_dispatch_requests request
set status = 'expired', updated_at = now()
where request.status = 'requested'
  and not public.order_payment_ready_for_dispatch(request.order_id);

create or replace function public.driver_can_view_available_order(
  p_order_id uuid,
  p_vehicle_type text,
  p_cargo_weight_tons numeric
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with active_request as (
    select request.driver_id, request.truck_id
    from public.customer_dispatch_requests request
    where request.order_id = p_order_id
      and request.status = 'requested'
    limit 1
  )
  select
    auth.uid() is not null
    and public.is_approved_driver()
    and public.order_payment_ready_for_dispatch(p_order_id)
    and (
      not exists (select 1 from active_request)
      or exists (
        select 1
        from active_request
        where active_request.driver_id = auth.uid()
      )
    )
    and exists (
      select 1
      from public.trucks t
      where (
          t.created_by = auth.uid()
          or t.driver_id = auth.uid()
        )
        and (
          (t.status = 'available' and (t.driver_id is null or t.driver_id = auth.uid()))
          or (t.status = 'assigned' and t.driver_id = auth.uid())
        )
        and public.truck_type_can_fulfill(p_vehicle_type, t.vehicle_type)
        and (
          p_cargo_weight_tons is null
          or (t.capacity_tons is not null and t.capacity_tons >= p_cargo_weight_tons)
        )
        and public.dispatch_documents_valid(auth.uid(), t.id)
        and not exists (
          select 1
          from public.orders active_order
          where active_order.truck_id = t.id
            and active_order.status in (
              'accepted'::public.order_status,
              'in_transit'::public.order_status
            )
        )
        and (
          not exists (select 1 from active_request)
          or exists (
            select 1
            from active_request
            where active_request.driver_id = auth.uid()
              and active_request.truck_id = t.id
          )
        )
    );
$$;
