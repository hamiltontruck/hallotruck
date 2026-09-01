create table if not exists public.partner_job_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  partner_id uuid not null references public.partner_organizations(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','confirmed','cancelled')),
  offer_note text,
  offered_by uuid not null references public.profiles(id) on delete restrict,
  offered_at timestamptz not null default now(),
  response_request_key uuid unique,
  responded_by uuid references public.profiles(id) on delete restrict,
  responded_at timestamptz,
  response_note text,
  selected_partner_vehicle_id uuid references public.partner_fleet_vehicles(id) on delete restrict,
  selected_truck_id uuid references public.trucks(id) on delete restrict,
  selected_driver_id uuid references public.profiles(id) on delete restrict,
  confirmation_request_key uuid unique,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_job_response_shape check (
    (status in ('pending','rejected','cancelled') and selected_truck_id is null and selected_driver_id is null and selected_partner_vehicle_id is null)
    or
    (status in ('accepted','confirmed') and selected_truck_id is not null and selected_driver_id is not null and selected_partner_vehicle_id is not null)
  )
);

create unique index if not exists partner_job_requests_one_open_order
  on public.partner_job_requests(order_id)
  where status in ('pending','accepted');
create index if not exists partner_job_requests_partner_status
  on public.partner_job_requests(partner_id,status,created_at desc);
create index if not exists partner_job_requests_order
  on public.partner_job_requests(order_id,created_at desc);

alter table public.partner_job_requests enable row level security;

drop policy if exists partner_job_requests_leadership_read on public.partner_job_requests;
create policy partner_job_requests_leadership_read
on public.partner_job_requests for select to authenticated
using ((select private.is_admin_or_ceo()));

drop policy if exists partner_job_requests_partner_read on public.partner_job_requests;
create policy partner_job_requests_partner_read
on public.partner_job_requests for select to authenticated
using ((select private.is_partner_member(partner_id)));

revoke all on public.partner_job_requests from anon;
revoke insert, update, delete on public.partner_job_requests from authenticated;
grant select on public.partner_job_requests to authenticated;

create or replace function public.admin_offer_partner_job(
  p_order_id uuid,
  p_partner_id uuid,
  p_note text,
  p_request_key uuid
)
returns public.partner_job_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_request public.partner_job_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then raise exception 'Partner job request key is required'; end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Partner job note must be 1000 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,0));
  select * into v_request from public.partner_job_requests where request_key=p_request_key;
  if found then return v_request; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status::text <> 'placed' or v_order.driver_id is not null or v_order.truck_id is not null then
    raise exception 'Only unassigned placed orders can be offered to a Partner';
  end if;
  if not exists (
    select 1 from public.partner_organizations organization
    where organization.id=p_partner_id and organization.status='active'
  ) then raise exception 'Active Partner organization not found'; end if;
  if exists (
    select 1 from public.partner_job_requests request
    where request.order_id=p_order_id and request.status in ('pending','accepted')
  ) then raise exception 'Order already has an open Partner job request'; end if;

  insert into public.partner_job_requests(
    request_key,order_id,partner_id,offer_note,offered_by
  ) values (
    p_request_key,p_order_id,p_partner_id,v_note,v_actor
  ) returning * into v_request;

  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values (
    p_partner_id,v_actor,'partner_job_offered','partner_job_request',v_request.id::text,
    jsonb_build_object('order_id',p_order_id,'tracking_id',v_order.tracking_id,'note',v_note)
  );
  return v_request;
exception when unique_violation then
  select * into v_request from public.partner_job_requests where request_key=p_request_key;
  if found then return v_request; end if;
  raise exception 'Order already has an open Partner job request';
end;
$$;

create or replace function public.partner_respond_job_request(
  p_request_id uuid,
  p_action text,
  p_truck_id uuid,
  p_note text,
  p_request_key uuid
)
returns public.partner_job_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_request public.partner_job_requests%rowtype;
  v_order public.orders%rowtype;
  v_truck public.trucks%rowtype;
  v_partner_vehicle public.partner_fleet_vehicles%rowtype;
  v_driver public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'Partner session required'; end if;
  if p_request_key is null then raise exception 'Partner response request key is required'; end if;
  if v_action not in ('accept','reject') then raise exception 'Unsupported Partner job response'; end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Partner response note must be 1000 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,0));
  select * into v_request from public.partner_job_requests where response_request_key=p_request_key;
  if found then return v_request; end if;

  select * into v_request from public.partner_job_requests where id=p_request_id for update;
  if not found then raise exception 'Partner job request not found'; end if;
  if not exists (
    select 1
    from public.partner_memberships membership
    join public.partner_organizations organization on organization.id=membership.partner_id
    where membership.partner_id=v_request.partner_id
      and membership.user_id=v_actor
      and membership.active
      and membership.member_role in ('owner','admin')
      and organization.status='active'
  ) then
    raise exception 'Partner fleet management access required';
  end if;
  if v_request.status <> 'pending' then raise exception 'Only pending Partner job requests can be answered'; end if;

  if v_action='reject' then
    update public.partner_job_requests
    set status='rejected',response_request_key=p_request_key,responded_by=v_actor,
        responded_at=now(),response_note=v_note,updated_at=now()
    where id=p_request_id returning * into v_request;
    insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_request.partner_id,v_actor,'partner_job_rejected','partner_job_request',v_request.id::text,
      jsonb_build_object('order_id',v_request.order_id,'note',v_note));
    return v_request;
  end if;

  if p_truck_id is null then raise exception 'Choose a Partner truck before accepting'; end if;
  select * into v_order from public.orders where id=v_request.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status::text <> 'placed' or v_order.driver_id is not null or v_order.truck_id is not null then
    raise exception 'Order is no longer available for Partner assignment';
  end if;

  select * into v_truck from public.trucks
  where id=p_truck_id and partner_id=v_request.partner_id for update;
  if not found then raise exception 'Truck does not belong to this Partner organization'; end if;
  select * into v_partner_vehicle from public.partner_fleet_vehicles
  where partner_id=v_request.partner_id and truck_id=p_truck_id for update;
  if not found then raise exception 'Partner fleet vehicle record not found'; end if;
  if v_truck.status <> 'available' or v_partner_vehicle.status <> 'available' then
    raise exception 'Partner truck is not available';
  end if;
  if v_partner_vehicle.assigned_driver_id is null or v_truck.driver_id is distinct from v_partner_vehicle.assigned_driver_id then
    raise exception 'Partner truck needs one approved fleet driver before acceptance';
  end if;

  select * into v_driver from public.profiles where id=v_partner_vehicle.assigned_driver_id;
  if not found or v_driver.role::text <> 'driver' or v_driver.driver_status::text <> 'approved' then
    raise exception 'Partner truck driver is not approved';
  end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.driver_id=v_driver.id
      and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)
  ) then raise exception 'Partner driver already has an active trip'; end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.truck_id=v_truck.id
      and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)
  ) then raise exception 'Partner truck already has an active trip'; end if;
  if not public.truck_type_can_fulfill(v_order.vehicle_type,v_truck.vehicle_type) then
    raise exception 'Partner truck type cannot fulfil this order';
  end if;
  if v_order.cargo_weight_tons is not null
     and (v_truck.capacity_tons is null or v_truck.capacity_tons < v_order.cargo_weight_tons) then
    raise exception 'Partner truck capacity is below the required cargo weight';
  end if;
  if not public.dispatch_documents_valid(v_driver.id,v_truck.id) then
    raise exception 'Driver or truck documents are incomplete, expired, or not verified';
  end if;

  update public.partner_job_requests
  set status='accepted',response_request_key=p_request_key,responded_by=v_actor,
      responded_at=now(),response_note=v_note,
      selected_partner_vehicle_id=v_partner_vehicle.id,
      selected_truck_id=v_truck.id,selected_driver_id=v_driver.id,updated_at=now()
  where id=p_request_id returning * into v_request;

  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_request.partner_id,v_actor,'partner_job_accepted','partner_job_request',v_request.id::text,
    jsonb_build_object('order_id',v_request.order_id,'truck_id',v_truck.id,'driver_id',v_driver.id,'note',v_note));
  return v_request;
end;
$$;

create or replace function public.admin_confirm_partner_job_request(
  p_request_id uuid,
  p_request_key uuid
)
returns public.partner_job_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.partner_job_requests%rowtype;
  v_order public.orders%rowtype;
  v_truck public.trucks%rowtype;
  v_partner_vehicle public.partner_fleet_vehicles%rowtype;
  v_driver public.profiles%rowtype;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then raise exception 'Partner assignment confirmation key is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,0));
  select * into v_request from public.partner_job_requests where confirmation_request_key=p_request_key;
  if found then return v_request; end if;

  select * into v_request from public.partner_job_requests where id=p_request_id for update;
  if not found then raise exception 'Partner job request not found'; end if;
  if v_request.status <> 'accepted' then raise exception 'Only accepted Partner jobs can be confirmed'; end if;
  if not exists (
    select 1 from public.partner_organizations organization
    where organization.id=v_request.partner_id and organization.status='active'
  ) then raise exception 'Active Partner organization not found'; end if;

  select * into v_order from public.orders where id=v_request.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status::text <> 'placed' or v_order.driver_id is not null or v_order.truck_id is not null then
    raise exception 'Order is no longer available for Partner assignment';
  end if;

  select * into v_truck from public.trucks
  where id=v_request.selected_truck_id and partner_id=v_request.partner_id for update;
  if not found then raise exception 'Selected Partner truck was not found'; end if;
  select * into v_partner_vehicle from public.partner_fleet_vehicles
  where id=v_request.selected_partner_vehicle_id
    and partner_id=v_request.partner_id and truck_id=v_truck.id for update;
  if not found then raise exception 'Selected Partner fleet record was not found'; end if;
  select * into v_driver from public.profiles where id=v_request.selected_driver_id;
  if not found or v_driver.role::text <> 'driver' or v_driver.driver_status::text <> 'approved' then
    raise exception 'Selected Partner driver is not approved';
  end if;
  if v_partner_vehicle.assigned_driver_id is distinct from v_driver.id
     or v_truck.driver_id is distinct from v_driver.id then
    raise exception 'Partner truck driver assignment changed before confirmation';
  end if;
  if v_truck.status <> 'available' or v_partner_vehicle.status <> 'available' then
    raise exception 'Selected Partner truck is no longer available';
  end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.id<>v_order.id and active_order.driver_id=v_driver.id
      and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)
  ) then raise exception 'Selected Partner driver already has an active trip'; end if;
  if exists (
    select 1 from public.orders active_order
    where active_order.id<>v_order.id and active_order.truck_id=v_truck.id
      and active_order.status in ('accepted'::public.order_status,'in_transit'::public.order_status)
  ) then raise exception 'Selected Partner truck already has an active trip'; end if;
  if not public.truck_type_can_fulfill(v_order.vehicle_type,v_truck.vehicle_type) then
    raise exception 'Selected Partner truck type cannot fulfil this order';
  end if;
  if v_order.cargo_weight_tons is not null
     and (v_truck.capacity_tons is null or v_truck.capacity_tons < v_order.cargo_weight_tons) then
    raise exception 'Selected Partner truck capacity is below the required cargo weight';
  end if;
  if not public.dispatch_documents_valid(v_driver.id,v_truck.id) then
    raise exception 'Driver or truck documents are incomplete, expired, or not verified';
  end if;

  update public.trucks set status='assigned',driver_id=v_driver.id,updated_at=now() where id=v_truck.id;
  update public.orders
  set truck_id=v_truck.id,driver_id=v_driver.id,status='accepted'::public.order_status,
      accepted_at=coalesce(accepted_at,now()),delivered_at=null
  where id=v_order.id;
  update public.partner_job_requests
  set status='confirmed',confirmation_request_key=p_request_key,
      confirmed_by=v_actor,confirmed_at=now(),updated_at=now()
  where id=v_request.id returning * into v_request;

  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_request.partner_id,v_actor,'partner_job_confirmed','partner_job_request',v_request.id::text,
    jsonb_build_object('order_id',v_order.id,'tracking_id',v_order.tracking_id,'truck_id',v_truck.id,'driver_id',v_driver.id));
  return v_request;
end;
$$;

create or replace function public.admin_cancel_partner_job_request(
  p_request_id uuid,
  p_reason text
)
returns public.partner_job_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_request public.partner_job_requests%rowtype;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if v_reason is null or char_length(v_reason)<5 then
    raise exception 'Cancellation reason must be at least 5 characters';
  end if;
  if char_length(v_reason)>500 then raise exception 'Cancellation reason must be 500 characters or fewer'; end if;

  select * into v_request from public.partner_job_requests where id=p_request_id for update;
  if not found then raise exception 'Partner job request not found'; end if;
  if v_request.status not in ('pending','accepted') then
    raise exception 'Only pending or accepted Partner jobs can be cancelled';
  end if;

  update public.partner_job_requests
  set status='cancelled',selected_partner_vehicle_id=null,selected_truck_id=null,selected_driver_id=null,
      cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=v_reason,updated_at=now()
  where id=p_request_id returning * into v_request;
  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_request.partner_id,v_actor,'partner_job_cancelled','partner_job_request',v_request.id::text,
    jsonb_build_object('order_id',v_request.order_id,'reason',v_reason));
  return v_request;
end;
$$;

revoke all on function public.admin_offer_partner_job(uuid,uuid,text,uuid) from public,anon;
revoke all on function public.partner_respond_job_request(uuid,text,uuid,text,uuid) from public,anon;
revoke all on function public.admin_confirm_partner_job_request(uuid,uuid) from public,anon;
revoke all on function public.admin_cancel_partner_job_request(uuid,text) from public,anon;
grant execute on function public.admin_offer_partner_job(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.partner_respond_job_request(uuid,text,uuid,text,uuid) to authenticated;
grant execute on function public.admin_confirm_partner_job_request(uuid,uuid) to authenticated;
grant execute on function public.admin_cancel_partner_job_request(uuid,text) to authenticated;
