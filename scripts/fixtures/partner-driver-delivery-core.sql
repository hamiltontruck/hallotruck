-- Actual pre-guard production delivery core; validates files and releases the truck.
CREATE OR REPLACE FUNCTION public.submit_delivery_proof_unchecked_188(p_order_id uuid, p_recipient_name text, p_delivery_note text, p_photo_path text, p_signature_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid=(select auth.uid()); v_role text=coalesce((select auth.jwt()->'app_metadata'->>'role'),''); v_driver uuid; v_truck uuid; v_status public.order_status;
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select driver_id,truck_id,status into v_driver,v_truck,v_status from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_role not in ('admin','ceo') and v_driver is distinct from v_actor then raise exception 'Not authorized for this order'; end if;
  if v_status<>'in_transit' then raise exception 'Order must be in transit'; end if;
  if p_photo_path not like p_order_id::text||'/%' or p_signature_path not like p_order_id::text||'/%' then raise exception 'Invalid proof path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='delivery-proofs' and name=p_photo_path) or not exists(select 1 from storage.objects where bucket_id='delivery-proofs' and name=p_signature_path) then raise exception 'Proof files are missing'; end if;
  insert into public.delivery_proofs(order_id,recipient_name,delivery_note,photo_path,signature_path,delivered_by) values(p_order_id,btrim(p_recipient_name),nullif(btrim(p_delivery_note),''),p_photo_path,p_signature_path,v_actor);
  update public.orders set status='delivered',delivered_at=now() where id=p_order_id;
  if v_truck is not null then update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_truck; end if;
end $function$
;
