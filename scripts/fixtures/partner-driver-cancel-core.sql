-- Actual pre-guard production cancellation and legacy finalize definitions.
CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_order_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor_id uuid := auth.uid(); v_status public.order_status; v_old_driver_id uuid; v_old_truck_id uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
 perform private.require_active_leadership('admin_cancel_order');
 if char_length(v_reason) not between 5 and 500 then raise exception 'Cancellation reason must be between 5 and 500 characters'; end if;
 select o.status,o.driver_id,o.truck_id into v_status,v_old_driver_id,v_old_truck_id from public.orders o where o.id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if v_status='delivered'::public.order_status then raise exception 'Delivered orders cannot be cancelled'; end if;
 if v_status='cancelled'::public.order_status then raise exception 'Order is already cancelled'; end if;
 if v_old_truck_id is not null then perform 1 from public.trucks t where t.id=v_old_truck_id for update; end if;
 update public.orders set status='cancelled'::public.order_status,cancellation_reason=v_reason,cancelled_at=now(),cancelled_by=v_actor_id,cancellation_source='admin',updated_at=now() where id=p_order_id;
 update public.customer_dispatch_requests set status='cancelled',updated_at=now() where order_id=p_order_id and status='requested';
 if v_old_truck_id is not null and not exists(select 1 from public.orders active_order where active_order.id<>p_order_id and active_order.truck_id=v_old_truck_id and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)) then
  update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_old_truck_id;
 end if;
 insert into public.order_assignment_history(order_id,action,reason,actor_id,old_driver_id,new_driver_id,old_truck_id,new_truck_id) values(p_order_id,'cancel',v_reason,v_actor_id,v_old_driver_id,null,v_old_truck_id,null);
end; $function$
;
CREATE OR REPLACE FUNCTION public.admin_finalize_driver_onboarding_unchecked_188(p_driver_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
begin
  if auth.uid() is null or v_actor_role not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_driver_id
      and p.role::text = 'driver'
      and char_length(btrim(coalesce(p.full_name, ''))) >= 2
      and regexp_replace(coalesce(p.phone, ''), '[[:space:]]+', '', 'g')
        ~ '^(09[0-9]{8}|[+]2519[0-9]{8})$'
      and char_length(btrim(coalesce(p.home_address, ''))) >= 4
  ) then
    raise exception 'Complete the driver name, Ethiopian phone number and home address before approval.'
      using errcode = '23514';
  end if;

  perform public.admin_approve_driver_onboarding(p_driver_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_available_jobs_v2()
 RETURNS TABLE(id uuid, tracking_id text, pickup_address text, dropoff_address text, vehicle_type text, distance_km numeric, price_etb numeric, cargo_description text, service_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id = auth.uid()
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    return;
  end if;
  return query select * from public.get_available_jobs_v2_calendar_unchecked_20260927();
end;
$function$
;
