-- Forward-fix for the intentionally unapplied 20260928010000 admin cancel/reassign migration.
-- Preserve current production assignment invariants by delegating reassignment to admin_assign_order.

create table if not exists public.order_assignment_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null check (action in ('cancel', 'reassign')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  actor_id uuid not null references public.profiles(id),
  old_driver_id uuid references public.profiles(id),
  new_driver_id uuid references public.profiles(id),
  old_truck_id uuid references public.trucks(id),
  new_truck_id uuid references public.trucks(id),
  created_at timestamptz not null default now()
);

create index if not exists order_assignment_history_order_created_idx
  on public.order_assignment_history(order_id, created_at desc);

alter table public.order_assignment_history enable row level security;

drop policy if exists order_assignment_history_leadership_read on public.order_assignment_history;
create policy order_assignment_history_leadership_read
  on public.order_assignment_history
  for select
  to authenticated
  using (private.is_admin_or_ceo());

revoke all on table public.order_assignment_history from public, anon, authenticated;
grant select on table public.order_assignment_history to authenticated;
grant all on table public.order_assignment_history to service_role;

create or replace function public.admin_cancel_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_old_driver_id uuid;
  v_old_truck_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform private.require_active_leadership('admin_cancel_order');

  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Cancellation reason must be between 5 and 500 characters';
  end if;

  select o.status, o.driver_id, o.truck_id
    into v_status, v_old_driver_id, v_old_truck_id
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_status = 'delivered'::public.order_status then
    raise exception 'Delivered orders cannot be cancelled';
  end if;
  if v_status = 'cancelled'::public.order_status then
    raise exception 'Order is already cancelled';
  end if;

  if v_old_truck_id is not null then
    perform 1 from public.trucks t where t.id = v_old_truck_id for update;
  end if;

  update public.orders
  set status = 'cancelled'::public.order_status,
      cancellation_reason = v_reason,
      cancelled_at = now(),
      cancelled_by = v_actor_id,
      cancellation_source = 'admin',
      updated_at = now()
  where id = p_order_id;

  update public.customer_dispatch_requests
  set status = 'cancelled',
      updated_at = now()
  where order_id = p_order_id
    and status = 'requested';

  if v_old_truck_id is not null
     and not exists (
       select 1
       from public.orders active_order
       where active_order.id <> p_order_id
         and active_order.truck_id = v_old_truck_id
         and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
     ) then
    update public.trucks
    set status = 'available',
        driver_id = null,
        updated_at = now()
    where id = v_old_truck_id;
  end if;

  insert into public.order_assignment_history(
    order_id, action, reason, actor_id,
    old_driver_id, new_driver_id, old_truck_id, new_truck_id
  ) values (
    p_order_id, 'cancel', v_reason, v_actor_id,
    v_old_driver_id, null, v_old_truck_id, null
  );
end;
$$;

create or replace function public.admin_reassign_order(
  p_order_id uuid,
  p_driver_id uuid,
  p_truck_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_old_driver_id uuid;
  v_old_truck_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform private.require_active_leadership('admin_reassign_order');

  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Reassignment reason must be between 5 and 500 characters';
  end if;
  if p_driver_id is null or p_truck_id is null then
    raise exception 'Driver and truck are required';
  end if;

  select o.status, o.driver_id, o.truck_id
    into v_status, v_old_driver_id, v_old_truck_id
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_status not in ('placed'::public.order_status, 'accepted'::public.order_status) then
    raise exception 'Only placed or accepted orders can be reassigned';
  end if;
  if v_old_driver_id is not distinct from p_driver_id
     and v_old_truck_id is not distinct from p_truck_id then
    raise exception 'Select a different driver or truck';
  end if;

  -- Reuse the current production assignment implementation so approval,
  -- active-trip uniqueness, truck locking/availability, type/capacity and
  -- dispatch-document validation remain identical to normal admin assignment.
  perform public.admin_assign_order(p_order_id, p_truck_id, p_driver_id);

  insert into public.order_assignment_history(
    order_id, action, reason, actor_id,
    old_driver_id, new_driver_id, old_truck_id, new_truck_id
  ) values (
    p_order_id, 'reassign', v_reason, v_actor_id,
    v_old_driver_id, p_driver_id, v_old_truck_id, p_truck_id
  );
end;
$$;

revoke all on function public.admin_cancel_order(uuid,text) from public, anon;
revoke all on function public.admin_reassign_order(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.admin_cancel_order(uuid,text) to authenticated, service_role;
grant execute on function public.admin_reassign_order(uuid,uuid,uuid,text) to authenticated, service_role;

notify pgrst, 'reload schema';
