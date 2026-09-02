begin;

create table public.partner_orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organizations(id) on delete restrict,
  canonical_order_id uuid unique references public.orders(id) on delete restrict,
  request_key uuid not null unique,
  reference text not null unique,
  status text not null default 'draft' check (status in (
    'draft','submitted','under_review','quoted','approved','placed','assigned',
    'accepted','in_transit','delivered','completed','cancelled','rejected','expired'
  )),
  pickup_location jsonb not null default '{}'::jsonb,
  dropoff_location jsonb not null default '{}'::jsonb,
  cargo jsonb not null default '{}'::jsonb,
  vehicle_requirements jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  pickup_contact jsonb not null default '{}'::jsonb,
  delivery_contact jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  payment jsonb not null default '{}'::jsonb,
  partner_notes text,
  admin_notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_order_location_shapes check (
    jsonb_typeof(pickup_location)='object' and jsonb_typeof(dropoff_location)='object'
  ),
  constraint partner_order_detail_shapes check (
    jsonb_typeof(cargo)='object' and jsonb_typeof(vehicle_requirements)='object'
    and jsonb_typeof(schedule)='object' and jsonb_typeof(pickup_contact)='object'
    and jsonb_typeof(delivery_contact)='object' and jsonb_typeof(pricing)='object'
    and jsonb_typeof(payment)='object'
  )
);

create table public.partner_order_status_history (
  id bigint generated always as identity primary key,
  partner_order_id uuid not null references public.partner_orders(id) on delete restrict,
  partner_id uuid not null references public.partner_organizations(id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index partner_orders_partner_status_updated
  on public.partner_orders(partner_id,status,updated_at desc);
create index partner_order_history_order_created
  on public.partner_order_status_history(partner_order_id,created_at asc);

alter table public.partner_orders enable row level security;
alter table public.partner_order_status_history enable row level security;

create policy partner_orders_authorized_read
on public.partner_orders for select to authenticated
using ((select private.is_admin_or_ceo()) or (select private.is_partner_member(partner_id)));

create policy partner_order_history_authorized_read
on public.partner_order_status_history for select to authenticated
using ((select private.is_admin_or_ceo()) or (select private.is_partner_member(partner_id)));

revoke all on table public.partner_orders, public.partner_order_status_history from public, anon, authenticated;
grant select on table public.partner_orders, public.partner_order_status_history to authenticated;

create or replace function public.partner_save_order_draft(
  p_partner_id uuid,
  p_order_id uuid,
  p_payload jsonb,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_reference text;
  v_contact jsonb;
  v_phone text;
  v_email text;
begin
  if v_actor is null then raise exception 'Partner session required'; end if;
  if p_partner_id is null or p_request_key is null then raise exception 'Partner organization and request key are required'; end if;
  if not exists (
    select 1 from public.partner_memberships membership
    join public.partner_organizations organization on organization.id=membership.partner_id
    join public.profiles profile on profile.id=membership.user_id
    where membership.partner_id=p_partner_id and membership.user_id=v_actor
      and membership.active and membership.member_role in ('owner','admin')
      and organization.status='active' and profile.role::text='partner'
  ) then raise exception 'Active Partner owner or admin access required'; end if;
  if jsonb_typeof(v_payload)<>'object' then raise exception 'Partner order payload must be an object'; end if;
  if length(coalesce(v_payload->>'partner_notes',''))>4000 then raise exception 'Partner notes must be 4000 characters or fewer'; end if;
  foreach v_contact in array array[v_payload->'pickup_contact',v_payload->'delivery_contact'] loop
    if v_contact is not null and jsonb_typeof(v_contact)<>'object' then raise exception 'Partner order contact must be an object'; end if;
    v_phone := regexp_replace(btrim(coalesce(v_contact->>'phone','')),'[[:space:]()-]','','g');
    v_email := lower(btrim(coalesce(v_contact->>'email','')));
    if v_phone<>'' and v_phone !~ '^(\+251|251|0)?9[0-9]{8}$' and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'Enter a valid Ethiopian mobile number or international number with country code';
    end if;
    if v_email<>'' and (length(v_email)>254 or v_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@.]{1,190}\.[A-Za-z]{2,63}$') then
      raise exception 'Enter a valid contact email address';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,0));
  select * into v_order from public.partner_orders where request_key=p_request_key and partner_id=p_partner_id;
  if found then return v_order; end if;

  if p_order_id is null then
    v_reference := 'PO-' || to_char(pg_catalog.clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.partner_orders(
      partner_id,request_key,reference,pickup_location,dropoff_location,cargo,
      vehicle_requirements,schedule,pickup_contact,delivery_contact,pricing,payment,
      partner_notes,created_by
    ) values (
      p_partner_id,p_request_key,v_reference,
      coalesce(v_payload->'pickup_location','{}'::jsonb),
      coalesce(v_payload->'dropoff_location','{}'::jsonb),
      coalesce(v_payload->'cargo','{}'::jsonb),
      coalesce(v_payload->'vehicle_requirements','{}'::jsonb),
      coalesce(v_payload->'schedule','{}'::jsonb),
      coalesce(v_payload->'pickup_contact','{}'::jsonb),
      coalesce(v_payload->'delivery_contact','{}'::jsonb),
      coalesce(v_payload->'pricing','{}'::jsonb),
      coalesce(v_payload->'payment','{}'::jsonb),
      nullif(btrim(v_payload->>'partner_notes'),''),v_actor
    ) returning * into v_order;
    insert into public.partner_order_status_history(partner_order_id,partner_id,from_status,to_status,actor_id,reason)
    values(v_order.id,p_partner_id,null,'draft',v_actor,'Partner order draft created');
  else
    select * into v_order from public.partner_orders where id=p_order_id and partner_id=p_partner_id for update;
    if not found then raise exception 'Partner order draft not found'; end if;
    if v_order.status<>'draft' then raise exception 'Only draft Partner orders can be edited'; end if;
    update public.partner_orders set
      request_key=p_request_key,
      pickup_location=coalesce(v_payload->'pickup_location',pickup_location),
      dropoff_location=coalesce(v_payload->'dropoff_location',dropoff_location),
      cargo=coalesce(v_payload->'cargo',cargo),
      vehicle_requirements=coalesce(v_payload->'vehicle_requirements',vehicle_requirements),
      schedule=coalesce(v_payload->'schedule',schedule),
      pickup_contact=coalesce(v_payload->'pickup_contact',pickup_contact),
      delivery_contact=coalesce(v_payload->'delivery_contact',delivery_contact),
      pricing=coalesce(v_payload->'pricing',pricing),
      payment=coalesce(v_payload->'payment',payment),
      partner_notes=coalesce(nullif(btrim(v_payload->>'partner_notes'),''),partner_notes),
      updated_at=now()
    where id=p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$$;

create or replace function public.partner_submit_order(
  p_order_id uuid,
  p_reason text,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_actor is null or p_request_key is null then raise exception 'Partner session and request key are required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,0));
  select * into v_order from public.partner_orders where id=p_order_id for update;
  if not found then raise exception 'Partner order not found'; end if;
  if not exists (
    select 1 from public.partner_memberships membership
    join public.partner_organizations organization on organization.id=membership.partner_id
    join public.profiles profile on profile.id=membership.user_id
    where membership.partner_id=v_order.partner_id and membership.user_id=v_actor
      and membership.active and membership.member_role in ('owner','admin')
      and organization.status='active' and profile.role::text='partner'
  ) then raise exception 'Active Partner owner or admin access required'; end if;
  if v_order.status='submitted' then return v_order; end if;
  if v_order.status<>'draft' then raise exception 'Only draft Partner orders can be submitted'; end if;
  if nullif(btrim(v_order.pickup_location->>'city'),'') is null
    or nullif(btrim(v_order.pickup_location->>'address'),'') is null
    or nullif(btrim(v_order.dropoff_location->>'city'),'') is null
    or nullif(btrim(v_order.dropoff_location->>'address'),'') is null
    or nullif(btrim(v_order.cargo->>'description'),'') is null
    or coalesce((v_order.cargo->>'weight_tons')::numeric,0)<=0
    or nullif(btrim(v_order.vehicle_requirements->>'truck_type'),'') is null
    or nullif(btrim(v_order.schedule->>'pickup_date'),'') is null
    or nullif(btrim(v_order.pickup_contact->>'name'),'') is null
    or nullif(btrim(v_order.pickup_contact->>'phone'),'') is null
    or nullif(btrim(v_order.delivery_contact->>'name'),'') is null
    or nullif(btrim(v_order.delivery_contact->>'phone'),'') is null
  then raise exception 'Complete locations, cargo, vehicle, schedule and contact details before submission'; end if;

  update public.partner_orders set status='submitted',submitted_at=now(),updated_at=now()
  where id=v_order.id returning * into v_order;
  insert into public.partner_order_status_history(partner_order_id,partner_id,from_status,to_status,actor_id,reason,metadata)
  values(v_order.id,v_order.partner_id,'draft','submitted',v_actor,coalesce(v_reason,'Submitted for HALLO review'),jsonb_build_object('request_key',p_request_key));
  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_order.partner_id,v_actor,'partner_order_submitted','partner_order',v_order.id::text,jsonb_build_object('reference',v_order.reference));
  return v_order;
end;
$$;

revoke all on function public.partner_save_order_draft(uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.partner_submit_order(uuid,text,uuid) from public,anon;
grant execute on function public.partner_save_order_draft(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.partner_submit_order(uuid,text,uuid) to authenticated;

commit;
