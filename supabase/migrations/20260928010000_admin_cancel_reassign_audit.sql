-- Local-only GREEN: mandatory reasons and order assignment audit.
-- Do not apply this migration to production in this task.
begin;

create table if not exists public.order_assignment_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  action text not null check (action in ('cancel','reassign')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  actor_id uuid not null,
  old_driver_id uuid,
  new_driver_id uuid,
  old_truck_id uuid,
  new_truck_id uuid,
  created_at timestamptz not null default now()
);

alter table public.order_assignment_history enable row level security;
revoke insert, update, delete on public.order_assignment_history from authenticated;
grant select on public.order_assignment_history to authenticated;

create or replace function public.admin_cancel_order(
  p_order_id uuid,
  p_reason text
)
returns table(order_id uuid, status public.order_status, cancellation_reason text, cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
as $function$
declare
  v_actor uuid := auth.uid();
  v_status public.order_status;
  v_truck_id uuid;
  v_driver_id uuid;
  v_reason text := btrim(p_reason);
  v_cancelled_at timestamptz := now();
begin
  perform private.require_active_leadership('admin_cancel_order');
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Cancellation reason must be at least 5 characters'; end if;
  if char_length(v_reason) > 500 then raise exception 'Cancellation reason must be 500 characters or fewer'; end if;

  select o.status, o.truck_id, o.driver_id into v_status, v_truck_id, v_driver_id
  from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status = 'cancelled'::public.order_status then raise exception 'This order is already cancelled'; end if;
  if v_status = 'delivered'::public.order_status then raise exception 'Delivered orders must be corrected from Finance instead of cancelled'; end if;
  if v_status not in ('quoted','placed','accepted','in_transit') then raise exception 'This order can no longer be cancelled'; end if;

  update public.orders set status='cancelled', cancellation_reason=v_reason,
    cancelled_at=v_cancelled_at, cancelled_by=v_actor, cancellation_source='admin'
  where id=p_order_id;
  insert into public.order_assignment_history(order_id,action,reason,actor_id,old_driver_id,old_truck_id)
  values(p_order_id,'cancel',v_reason,v_actor,v_driver_id,v_truck_id);
  update public.customer_dispatch_requests set status='cancelled', updated_at=v_cancelled_at
  where order_id=p_order_id and status in ('requested','approved');
  if v_truck_id is not null then
    update public.trucks set status='available', driver_id=null, updated_at=v_cancelled_at
    where id=v_truck_id and status='assigned' and not exists (
      select 1 from public.orders o where o.id<>p_order_id and o.truck_id=v_truck_id
      and o.status in ('accepted','in_transit'));
  end if;
  return query select p_order_id,'cancelled'::public.order_status,v_reason,v_cancelled_at;
end;
$function$;

create or replace function public.admin_reassign_order(
  p_order_id uuid, p_truck_id uuid, p_driver_id uuid, p_reason text
) returns void language plpgsql security definer set search_path='' as $function$
declare
  v_actor uuid := auth.uid(); v_reason text := btrim(p_reason);
  v_old_driver uuid; v_old_truck uuid; v_status public.order_status;
begin
  perform private.require_active_leadership('admin_reassign_order');
  if v_reason is null or char_length(v_reason)<5 then raise exception 'Reassignment reason must be at least 5 characters'; end if;
  if char_length(v_reason)>500 then raise exception 'Reassignment reason must be 500 characters or fewer'; end if;
  select driver_id,truck_id,status into v_old_driver,v_old_truck,v_status
  from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status not in ('accepted','in_transit') then raise exception 'Only an active assigned order can be reassigned'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_driver_id and p.role='driver' and p.driver_status='approved') then raise exception 'Select an approved driver'; end if;
  if exists(select 1 from public.orders o where o.id<>p_order_id and o.driver_id=p_driver_id and o.status in ('accepted','in_transit')) then raise exception 'This driver already has an active trip'; end if;
  if not exists(select 1 from public.trucks t where t.id=p_truck_id and (t.status='available' or t.id=v_old_truck)) then raise exception 'Truck is not available'; end if;
  if exists(select 1 from public.orders o where o.id<>p_order_id and o.truck_id=p_truck_id and o.status in ('accepted','in_transit')) then raise exception 'This truck is already assigned to an active trip'; end if;

  if v_old_truck is not null and v_old_truck<>p_truck_id then
    update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_old_truck;
  end if;
  update public.trucks set status='assigned',driver_id=p_driver_id,updated_at=now() where id=p_truck_id;
  update public.orders set truck_id=p_truck_id,driver_id=p_driver_id where id=p_order_id;
  insert into public.order_assignment_history(order_id,action,reason,actor_id,old_driver_id,new_driver_id,old_truck_id,new_truck_id)
  values(p_order_id,'reassign',v_reason,v_actor,v_old_driver,p_driver_id,v_old_truck,p_truck_id);
end;
$function$;

revoke all on function public.admin_cancel_order(uuid,text) from public,anon;
grant execute on function public.admin_cancel_order(uuid,text) to authenticated;
revoke all on function public.admin_reassign_order(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.admin_reassign_order(uuid,uuid,uuid,text) to authenticated;
commit;
