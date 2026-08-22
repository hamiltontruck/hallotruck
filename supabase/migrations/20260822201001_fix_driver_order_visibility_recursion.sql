-- Keep direct orders-table reads aligned with the matching rules used by the
-- job and claim RPCs without causing orders -> trucks -> orders RLS recursion.

create or replace function public.driver_has_matching_ready_truck(
  p_vehicle_type text,
  p_cargo_weight_tons numeric
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    auth.uid() is not null
    and public.is_approved_driver()
    and exists (
      select 1
      from public.trucks t
      where t.driver_id = auth.uid()
        and t.status in ('available', 'assigned')
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
    );
$function$;

revoke execute on function public.driver_has_matching_ready_truck(text, numeric) from public, anon;
grant execute on function public.driver_has_matching_ready_truck(text, numeric) to authenticated;

drop policy if exists "orders: read relevant or available" on public.orders;

create policy "orders: read relevant or available"
  on public.orders
  for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or public.is_admin()
    or (
      status = 'placed'::public.order_status
      and driver_id is null
      and public.driver_has_matching_ready_truck(vehicle_type, cargo_weight_tons)
    )
  );

notify pgrst, 'reload schema';
