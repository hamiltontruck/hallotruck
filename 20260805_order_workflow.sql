alter table public.orders
  add column if not exists truck_id uuid references public.trucks(id) on delete set null;

create index if not exists orders_truck_id_idx on public.orders(truck_id);

create or replace function public.admin_assign_order(p_order_id uuid, p_truck_id uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old_truck uuid;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then raise exception 'Admin or CEO role required'; end if;
  select truck_id into v_old_truck from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists(select 1 from public.profiles where id=p_driver_id and role='driver') then raise exception 'Driver profile not found'; end if;
  if not exists(select 1 from public.trucks where id=p_truck_id and (status='available' or id=v_old_truck) for update) then raise exception 'Truck is not available'; end if;
  if v_old_truck is not null and v_old_truck<>p_truck_id then update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_old_truck; end if;
  update public.trucks set status='assigned',driver_id=p_driver_id,updated_at=now() where id=p_truck_id;
  update public.orders set truck_id=p_truck_id,driver_id=p_driver_id,status='accepted',accepted_at=coalesce(accepted_at,now()) where id=p_order_id;
end $$;

create or replace function public.admin_transition_order(p_order_id uuid, p_status public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.order_status; v_truck uuid;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then raise exception 'Admin or CEO role required'; end if;
  select status,truck_id into v_current,v_truck from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not ((v_current='placed' and p_status='accepted') or (v_current='accepted' and p_status='in_transit') or (v_current='in_transit' and p_status='delivered')) then raise exception 'Invalid status transition: % to %',v_current,p_status; end if;
  if p_status='accepted' and v_truck is null then raise exception 'Assign a truck and driver first'; end if;
  update public.orders set status=p_status,accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,delivered_at=case when p_status='delivered' then now() else delivered_at end where id=p_order_id;
  if p_status='delivered' and v_truck is not null then update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_truck; end if;
end $$;

create or replace function public.admin_record_payment(p_order_id uuid,p_provider text,p_provider_ref text,p_amount_etb numeric,p_event public.payment_event)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then raise exception 'Admin or CEO role required'; end if;
  if p_amount_etb<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  insert into public.payments(order_id,provider,provider_ref,amount_etb,event) values(p_order_id,btrim(p_provider),nullif(btrim(p_provider_ref),''),p_amount_etb,p_event);
  update public.orders set payment_provider=btrim(p_provider),payment_ref=nullif(btrim(p_provider_ref),''),payment_status=case p_event when 'held_escrow' then 'held_escrow'::public.payment_status when 'released' then 'released'::public.payment_status when 'refunded' then 'refunded'::public.payment_status else payment_status end where id=p_order_id;
end $$;

revoke all on function public.admin_assign_order(uuid,uuid,uuid) from public,anon;
revoke all on function public.admin_transition_order(uuid,public.order_status) from public,anon;
revoke all on function public.admin_record_payment(uuid,text,text,numeric,public.payment_event) from public,anon;
grant execute on function public.admin_assign_order(uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_transition_order(uuid,public.order_status) to authenticated;
grant execute on function public.admin_record_payment(uuid,text,text,numeric,public.payment_event) to authenticated;
