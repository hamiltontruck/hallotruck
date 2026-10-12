begin;
-- Apply ownership, authorization and scoped rosters atomically.
create table public.partner_driver_ownership (
 driver_id uuid primary key references public.profiles(id),
 partner_id uuid not null references public.partner_organizations(id),
 registration_id uuid not null unique references public.partner_driver_registrations(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.partner_driver_ownership enable row level security;
create policy partner_driver_ownership_rpc_only on public.partner_driver_ownership for all to authenticated using(false) with check(false);
revoke all on public.partner_driver_ownership from public,anon,authenticated;
create index partner_driver_ownership_org_idx on public.partner_driver_ownership(partner_id);

do $$ begin
 if exists(select 1 from public.partner_driver_registrations r left join public.profiles p on p.id=r.driver_id
 left join auth.users u on u.id=r.driver_id where r.driver_id is not null
 and (r.status not in ('registered','approved','rejected') or p.role::text is distinct from 'driver'
 or lower(u.email) is distinct from r.email or u.email_confirmed_at is null or u.created_at<r.created_at)) then
  raise exception 'Partner ownership backfill conflicts require explicit review';
 end if;
end $$;
insert into public.partner_driver_ownership(driver_id,partner_id,registration_id)
 select driver_id,partner_id,id from public.partner_driver_registrations where driver_id is not null;

create function private.sync_partner_driver_ownership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' and old.driver_id is not null then raise exception 'Claimed Partner registration history is immutable'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and old.driver_id is not null and (new.driver_id is distinct from old.driver_id or new.partner_id is distinct from old.partner_id) then
  raise exception 'Partner driver ownership cannot be transferred';
 end if;
 if new.driver_id is not null then
  if new.status not in ('registered','approved','rejected') then raise exception 'Claimed Partner registration required'; end if;
  insert into public.partner_driver_ownership(driver_id,partner_id,registration_id)
  values(new.driver_id,new.partner_id,new.id) on conflict(driver_id) do nothing;
  if not exists(select 1 from public.partner_driver_ownership where driver_id=new.driver_id and partner_id=new.partner_id and registration_id=new.id) then
   raise exception 'Partner driver ownership conflict';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.sync_partner_driver_ownership() from public,anon,authenticated;
create trigger partner_registration_ownership after insert or update or delete on public.partner_driver_registrations
 for each row execute function private.sync_partner_driver_ownership();

create function public.get_my_driver_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles; v_owner public.partner_driver_ownership; v_name text; v_active boolean; v_status text;
begin
 if auth.uid() is null then raise exception 'Driver authentication required'; end if;
 select * into v_profile from public.profiles where id=auth.uid() and role::text='driver';
 if not found then raise exception 'Driver account required'; end if;
 select * into v_owner from public.partner_driver_ownership where driver_id=auth.uid();
 if not found then return jsonb_build_object('kind','hallo','driver_id',auth.uid(),'partner_id',null,'partner_name',null,'organization_active',true,'driver_status',v_profile.driver_status::text,'registration_status',null); end if;
 select o.name,o.status='active',r.status into v_name,v_active,v_status
 from public.partner_organizations o join public.partner_driver_registrations r on r.id=v_owner.registration_id where o.id=v_owner.partner_id;
 return jsonb_build_object('kind','partner','driver_id',auth.uid(),'partner_id',v_owner.partner_id,'partner_name',v_name,'organization_active',coalesce(v_active,false),'driver_status',v_profile.driver_status::text,'registration_status',v_status);
end $$;

create function public.list_admin_driver_roster(p_scope text)
returns table(id uuid,full_name text,phone text,email text,home_address text,driver_status text,partner_id uuid,partner_name text,truck_id uuid,plate_number text)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active_leadership('list_admin_driver_roster');
 if p_scope not in ('hallo','partner') or p_scope is null then raise exception 'Invalid driver roster scope'; end if;
 return query select p.id,p.full_name,p.phone,p.email,p.home_address,p.driver_status::text,w.partner_id,o.name,t.id,t.plate_number
 from public.profiles p left join public.partner_driver_ownership w on w.driver_id=p.id
 left join public.partner_organizations o on o.id=w.partner_id
 left join lateral (select tr.id,tr.plate_number from public.trucks tr where tr.driver_id=p.id and (w.driver_id is null or tr.partner_id=w.partner_id) order by tr.updated_at desc limit 1) t on true
 where p.role::text='driver' and ((p_scope='hallo' and w.driver_id is null) or (p_scope='partner' and w.driver_id is not null)) order by p.full_name,p.id;
end $$;
create function public.list_partner_driver_roster(p_partner_id uuid)
returns table(id uuid,full_name text,phone text,email text,home_address text,driver_status text,partner_id uuid,partner_name text,truck_id uuid,plate_number text)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_partner_driver_manager(p_partner_id);
 return query select p.id,p.full_name,p.phone,p.email,p.home_address,p.driver_status::text,w.partner_id,o.name,t.id,t.plate_number
 from public.partner_driver_ownership w join public.profiles p on p.id=w.driver_id join public.partner_organizations o on o.id=w.partner_id
 left join lateral (select tr.id,tr.plate_number from public.trucks tr where tr.driver_id=p.id and tr.partner_id=w.partner_id order by tr.updated_at desc limit 1) t on true
 where w.partner_id=p_partner_id order by p.full_name,p.id;
end $$;
revoke all on function public.get_my_driver_workspace(),public.list_admin_driver_roster(text),public.list_partner_driver_roster(uuid) from public,anon;
grant execute on function public.get_my_driver_workspace(),public.list_admin_driver_roster(text),public.list_partner_driver_roster(uuid) to authenticated;

create function private.require_hallo_driver(p_driver_id uuid default auth.uid()) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.partner_driver_ownership where driver_id=p_driver_id) then
  raise exception 'Partner drivers use their own assigned Partner workspace' using errcode='42501';
 end if;
end $$;
create function private.partner_driver_order_allowed(p_driver_id uuid,p_order_id uuid,p_truck_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.partner_driver_ownership w
 join public.profiles p on p.id=w.driver_id and p.role::text='driver' and p.driver_status::text='approved'
 join public.partner_driver_registrations r on r.id=w.registration_id and r.status='approved'
 join public.partner_organizations org on org.id=w.partner_id and org.status='active'
 join public.orders o on o.id=p_order_id and o.driver_id=w.driver_id
 join public.trucks t on t.id=o.truck_id and t.partner_id=w.partner_id and t.driver_id=w.driver_id
 join public.partner_fleet_vehicles f on f.truck_id=t.id and f.partner_id=w.partner_id and f.assigned_driver_id=w.driver_id
 join public.partner_job_requests j on j.order_id=o.id and j.partner_id=w.partner_id and j.selected_truck_id=t.id and j.status='confirmed'
 where w.driver_id=p_driver_id and (p_truck_id is null or t.id=p_truck_id));
$$;
create function private.require_driver_workspace_access(p_order_id uuid default null,p_truck_id uuid default null,p_driver_id uuid default auth.uid())
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.partner_driver_ownership where driver_id=p_driver_id) then return; end if;
 if not exists(select 1 from public.partner_driver_ownership w join public.partner_organizations o on o.id=w.partner_id
 join public.profiles p on p.id=w.driver_id join public.partner_driver_registrations r on r.id=w.registration_id
 where w.driver_id=p_driver_id and o.status='active' and p.driver_status::text='approved' and r.status='approved') then
  raise exception 'Active approved Partner driver required' using errcode='42501';
 end if;
 if p_order_id is null or not private.partner_driver_order_allowed(p_driver_id,p_order_id,p_truck_id) then
  raise exception 'Own assigned confirmed Partner dispatch required' using errcode='42501';
 end if;
end $$;
revoke all on function private.require_hallo_driver(uuid),private.partner_driver_order_allowed(uuid,uuid,uuid),private.require_driver_workspace_access(uuid,uuid,uuid) from public,anon,authenticated;

create function public.driver_workspace_order_visible(p_order_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.partner_driver_ownership where driver_id=auth.uid())
 or private.partner_driver_order_allowed(auth.uid(),p_order_id);
$$;
revoke all on function public.driver_workspace_order_visible(uuid) from public,anon;
grant execute on function public.driver_workspace_order_visible(uuid) to authenticated;
create policy orders_driver_workspace_scope on public.orders as restrictive for select to authenticated
 using(public.driver_workspace_order_visible(id));

create function private.guard_partner_driver_order_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.partner_driver_ownership where driver_id=auth.uid()) then
  if tg_op<>'UPDATE' then raise exception 'Partner drivers cannot create or delete orders'; end if;
  if old.driver_id is distinct from auth.uid() or new.driver_id is distinct from old.driver_id or new.truck_id is distinct from old.truck_id then
   raise exception 'Partner drivers cannot claim HALLO jobs or change assignment';
  end if;
  perform private.require_driver_workspace_access(old.id,old.truck_id);
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger orders_partner_driver_mutation before insert or update or delete on public.orders
 for each row execute function private.guard_partner_driver_order_mutation();

create function private.guard_partner_driver_vehicle_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_partner uuid;
begin
 select partner_id into v_partner from public.partner_driver_ownership where driver_id=auth.uid();
 if found then
  if tg_op<>'UPDATE' then raise exception 'Partner vehicles are registered and linked by Partner/Admin'; end if;
  if new.driver_id is distinct from auth.uid() or new.partner_id is distinct from v_partner
  or (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at'])
  or not exists(select 1 from public.orders o where o.driver_id=auth.uid() and o.truck_id=old.id
   and private.partner_driver_order_allowed(auth.uid(),o.id,old.id)) then
   raise exception 'Partner vehicle details are managed by Admin';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger trucks_partner_driver_mutation before insert or update or delete on public.trucks
 for each row execute function private.guard_partner_driver_vehicle_mutation();

create function private.guard_partner_driver_document_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_partner uuid;
begin
 select partner_id into v_partner from public.partner_driver_ownership where driver_id=auth.uid();
 if found then
  if new.driver_id is distinct from auth.uid() or not exists(select 1 from public.partner_organizations where id=v_partner and status='active') then raise exception 'Own active Partner driver documents required'; end if;
  if new.truck_id is not null and not exists(select 1 from public.trucks t join public.partner_fleet_vehicles f on f.truck_id=t.id
   where t.id=new.truck_id and t.driver_id=auth.uid() and t.partner_id=v_partner and f.partner_id=v_partner and f.assigned_driver_id=auth.uid()) then
   raise exception 'Admin-linked own Partner vehicle documents required';
  end if;
 end if; return new;
end $$;
create trigger documents_partner_driver_scope before insert or update on public.driver_verification_files
 for each row execute function private.guard_partner_driver_document_mutation();

create function private.guard_partner_tracking_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_driver_workspace_access(new.order_id,null,new.driver_id); return new;
end $$;
-- Service-role GPS writes carry the verified driver ID; guard the DB boundary too.
create trigger tracking_partner_driver_scope before insert or update on public.tracking_pings
 for each row execute function private.guard_partner_tracking_mutation();
revoke all on function private.guard_partner_driver_order_mutation(),private.guard_partner_driver_vehicle_mutation(),private.guard_partner_driver_document_mutation(),private.guard_partner_tracking_mutation() from public,anon,authenticated;

create function public.get_partner_driver_vehicle() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_vehicle jsonb;
begin
 v_context:=public.get_my_driver_workspace();
 if v_context->>'kind'<>'partner' or not (v_context->>'organization_active')::boolean or v_context->>'driver_status'='suspended' or v_context->>'registration_status'='rejected' then raise exception 'Active Partner driver required'; end if;
 select jsonb_build_object('id',t.id,'plate_number',t.plate_number,'vehicle_type',t.vehicle_type,'capacity_tons',t.capacity_tons,'status',t.status::text) into v_vehicle
 from public.trucks t join public.partner_fleet_vehicles f on f.truck_id=t.id
 where t.driver_id=auth.uid() and t.partner_id=(v_context->>'partner_id')::uuid and f.partner_id=t.partner_id and f.assigned_driver_id=auth.uid()
 order by t.updated_at desc limit 1;
 return v_vehicle;
end $$;
revoke all on function public.get_partner_driver_vehicle() from public,anon;
grant execute on function public.get_partner_driver_vehicle() to authenticated;

create function public.get_partner_driver_active_trip() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_order public.orders;
begin
 v_context:=public.get_my_driver_workspace();
 if v_context->>'kind'<>'partner' then raise exception 'Partner driver required'; end if;
 if not (v_context->>'organization_active')::boolean or v_context->>'driver_status'<>'approved' or v_context->>'registration_status'<>'approved' then raise exception 'Active approved Partner driver required'; end if;
 select * into v_order from public.orders where driver_id=auth.uid() and status::text in ('accepted','in_transit') order by created_at desc limit 1;
 if not found then return null; end if;
 perform private.require_driver_workspace_access(v_order.id,v_order.truck_id);
 return to_jsonb(v_order);
end $$;
revoke all on function public.get_partner_driver_active_trip() from public,anon;
grant execute on function public.get_partner_driver_active_trip() to authenticated;

-- Automatic trip completion/cancellation releases availability, not Partner
-- employment. Retain the canonical driver/fleet link; HALLO release is unchanged.
create function private.driver_for_vehicle_release(p_truck_id uuid,p_driver_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.partner_driver_ownership w
 join public.trucks t on t.id=p_truck_id and t.partner_id=w.partner_id
 join public.partner_fleet_vehicles f on f.truck_id=t.id and f.partner_id=w.partner_id and f.assigned_driver_id=w.driver_id
 where w.driver_id=p_driver_id) then p_driver_id else null end;
$$;
revoke all on function private.driver_for_vehicle_release(uuid,uuid) from public,anon,authenticated;
do $$ declare f record; v_def text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname in ('admin_cancel_order','customer_cancel_order','admin_assign_order_unchecked_188') or p.proname like 'submit_delivery_proof%') loop
  v_def:=pg_get_functiondef(f.oid);
  if v_def ~* 'driver_id\s*=\s*null' then
   execute regexp_replace(v_def,'driver_id\s*=\s*null','driver_id=private.driver_for_vehicle_release(id,driver_id)','gi');
  end if;
 end loop;
end $$;

-- Mobile V2 helpers are SECURITY DEFINER too: guard their read entrypoints.
do $$ declare f record; v_private text; begin
 for f in select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('driver_can_view_available_order_v2','driver_can_view_available_order_v2_calendar_unchecked_20260927') loop
  v_private:=case when f.proname='driver_can_view_available_order_v2' then 'hallo_order_visibility_v2_core' else 'hallo_order_visibility_v2_calendar_core' end;
  execute format('alter function public.%I(uuid,text,numeric) set schema private',f.proname);
  execute format('alter function private.%I(uuid,text,numeric) rename to %I',f.proname,v_private);
  execute format('revoke all on function private.%I(uuid,text,numeric) from public,anon,authenticated',v_private);
  execute format('create function public.%I(p_order_id uuid,p_vehicle_type text,p_cargo_weight_tons numeric) returns boolean language sql stable security definer set search_path='''' as $body$ select case when exists(select 1 from public.partner_driver_ownership where driver_id=auth.uid()) then false else private.%I(p_order_id,p_vehicle_type,p_cargo_weight_tons) end $body$',f.proname,v_private);
  execute format('revoke all on function public.%I(uuid,text,numeric) from public,anon',f.proname);
  execute format('grant execute on function public.%I(uuid,text,numeric) to authenticated',f.proname);
 end loop;
end $$;

-- Scope the actual generic Admin dispatch source, not just its UI dropdown.
do $$ declare v_result text; begin
 select pg_get_function_result('public.admin_order_assignment_candidates(uuid)'::regprocedure) into v_result;
 alter function public.admin_order_assignment_candidates(uuid) set schema private;
 alter function private.admin_order_assignment_candidates(uuid) rename to hallo_assignment_candidates_core;
 revoke all on function private.hallo_assignment_candidates_core(uuid) from public,anon,authenticated;
 execute 'create function public.admin_order_assignment_candidates(p_order_id uuid) returns '||v_result||' language plpgsql security definer set search_path='''' as $body$ begin perform private.require_active_leadership(''admin_order_assignment_candidates''); return query select c.* from private.hallo_assignment_candidates_core(p_order_id) c where not exists(select 1 from public.partner_driver_ownership w where w.driver_id=c.driver_id); end $body$';
 revoke all on function public.admin_order_assignment_candidates(uuid) from public,anon;
 grant execute on function public.admin_order_assignment_candidates(uuid) to authenticated;
end $$;

-- Keep existing claim/profile implementations and ACLs; prepend a fail-closed
alter function public.driver_can_view_available_order(uuid,text,numeric) set schema private;
alter function private.driver_can_view_available_order(uuid,text,numeric) rename to hallo_available_order_core;
revoke all on function private.hallo_available_order_core(uuid,text,numeric) from public,anon,authenticated;
create function public.driver_can_view_available_order(p_order_id uuid,p_vehicle_type text,p_cargo_weight_tons numeric)
returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.partner_driver_ownership where driver_id=auth.uid()) then false
 else private.hallo_available_order_core(p_order_id,p_vehicle_type,p_cargo_weight_tons) end;
$$;
revoke all on function public.driver_can_view_available_order(uuid,text,numeric) from public,anon;
grant execute on function public.driver_can_view_available_order(uuid,text,numeric) to authenticated;

-- Keep existing claim/profile implementations and ACLs; prepend a fail-closed
-- ownership guard to every extant public overload, including legacy variants.
do $$ declare f record; v_def text; v_guarded text; begin
 for f in select p.oid,p.proname,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_language l on l.oid=p.prolang where n.nspname='public' and
 (p.proname in ('claim_order','claim_order_with_truck','claim_order_with_truck_v2','get_available_jobs_v2','driver_save_vehicle_profile','driver_register_vehicle_profile','admin_link_driver_onboarding_truck','admin_assign_order','admin_assign_order_unchecked_188','admin_finalize_driver_onboarding','admin_finalize_driver_onboarding_unchecked_188')
 or p.proname like 'driver_available_trucks_for_order%' or p.proname like 'get_available_jobs%') loop
  if f.lanname='sql' and f.proname='driver_save_vehicle_profile' then continue; end if; -- delegates to the guarded four-argument overload
  if f.lanname<>'plpgsql' then raise exception 'Unexpected HALLO driver function language: %',f.proname; end if;
  v_def:=pg_get_functiondef(f.oid);
  v_guarded:=regexp_replace(f.prosrc,E'(^|[;\n])[ \t]*begin\\M',E'\\1begin\n perform private.require_hallo_driver('||case when f.proname like 'admin_%' then 'p_driver_id' else '' end||E');','i');
  if v_guarded=f.prosrc then raise exception 'Driver function body requires review: %',f.proname; end if;
  execute replace(v_def,f.prosrc,v_guarded);
 end loop;
end $$;

-- All existing driver trip RPCs retain their original checks and add the same
-- organization boundary. Tracking verifies the Edge-authenticated driver ID.
do $$ declare f record; v_def text; v_guarded text; begin
 for f in select p.oid,p.proname,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_language l on l.oid=p.prolang where n.nspname='public' and
 (p.proname in ('driver_finish_trip','driver_record_trip_payment_result','driver_submit_collected_payment','driver_order_contact','driver_payment_status','driver_collected_payment_status','driver_create_trip_dispute','record_driver_tracking_ping')
 or p.proname like 'submit_delivery_proof%') loop
  if f.lanname<>'plpgsql' then raise exception 'Unexpected driver trip function language: %',f.proname; end if;
  v_def:=pg_get_functiondef(f.oid);
  v_guarded:=regexp_replace(f.prosrc,E'(^|[;\n])[ \t]*begin\\M',E'\\1begin\n perform private.require_driver_workspace_access(p_order_id,null,'||case when f.proname='record_driver_tracking_ping' then 'p_driver_id' else 'auth.uid()' end||E');','i');
  if v_guarded=f.prosrc then raise exception 'Trip function body requires review: %',f.proname; end if;
  execute replace(v_def,f.prosrc,v_guarded);
 end loop;
end $$;

-- Preserve existing HALLO approval exactly, but make its public entry HALLO-only.
alter function public.admin_approve_driver_onboarding(uuid) set schema private;
alter function private.admin_approve_driver_onboarding(uuid) rename to approve_driver_onboarding_core;
revoke all on function private.approve_driver_onboarding_core(uuid) from public,anon,authenticated;
create function public.admin_approve_driver_onboarding(p_driver_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active_leadership('admin_approve_driver_onboarding');
 perform private.require_hallo_driver(p_driver_id);
 perform private.approve_driver_onboarding_core(p_driver_id);
end $$;
revoke all on function public.admin_approve_driver_onboarding(uuid) from public,anon;
grant execute on function public.admin_approve_driver_onboarding(uuid) to authenticated;
do $$ declare v_def text; begin
 v_def:=pg_get_functiondef('public.review_partner_driver_registration(uuid,text,text)'::regprocedure);
 if position('public.admin_approve_driver_onboarding(v_row.driver_id)' in v_def)=0 then raise exception 'Partner approval definition needs review before migration'; end if;
 v_def:=replace(v_def,'public.admin_approve_driver_onboarding(v_row.driver_id)','private.approve_driver_onboarding_core(v_row.driver_id)');
 -- Restoring a suspended Partner driver to pending must use this same verified
 -- Partner approval path, rather than the now HALLO-only generic entry.
 v_def:=replace(v_def,'if not found or v_row.status not in (''invited'',''registered'') then',
  'if not found or (v_row.status not in (''invited'',''registered'') and not (v_row.status=''approved'' and exists(select 1 from public.profiles where id=v_row.driver_id and driver_status::text=''pending''))) then');
 v_def:=replace(v_def,'v_row.status<>''registered''','v_row.status not in (''registered'',''approved'')');
 execute v_def;
end $$;

create function public.admin_driver_compliance_workspace(p_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_drivers jsonb; v_ids uuid[];
begin
 perform private.require_active_leadership('admin_driver_compliance_workspace');
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),coalesce(array_agg(r.id),'{}'::uuid[]) into v_drivers,v_ids from public.list_admin_driver_roster(p_scope) r;
 return jsonb_build_object('drivers',v_drivers,
  'trucks',coalesce((select jsonb_agg(to_jsonb(t)) from public.trucks t where t.driver_id=any(v_ids) or t.id in (select d.truck_id from public.driver_verification_files d where d.driver_id=any(v_ids))),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.driver_verification_files d where d.driver_id=any(v_ids)),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(to_jsonb(o)) from (select * from public.orders where driver_id=any(v_ids) order by created_at desc limit 1000) o),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p where p.order_id in (select o.id from public.orders o where o.driver_id=any(v_ids))),'[]'::jsonb));
end $$;
revoke all on function public.admin_driver_compliance_workspace(text) from public,anon;
grant execute on function public.admin_driver_compliance_workspace(text) to authenticated;
commit;
notify pgrst,'reload schema';
