begin;
create table public.partner_driver_registrations (
 id uuid primary key default gen_random_uuid(),
 partner_id uuid not null references public.partner_organizations(id),
 full_name text not null check (length(full_name) between 2 and 120),
 email text not null unique check (email=lower(btrim(email))),
 phone text not null,
 invitation_token uuid not null unique default gen_random_uuid(),
 status text not null default 'invited' check(status in ('invited','registered','approved','rejected')),
 driver_id uuid unique references public.profiles(id),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default now()+interval '7 days',
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 review_note text
);
create index partner_driver_registrations_org_idx on public.partner_driver_registrations(partner_id,created_at desc);
alter table public.partner_driver_registrations enable row level security;
create policy partner_driver_registration_rpc_only on public.partner_driver_registrations
 for all to authenticated using(false) with check(false);
revoke all on public.partner_driver_registrations from public,anon,authenticated;

create function private.guard_partner_driver_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role::text='driver' and new.driver_status::text='approved' and old.driver_status::text is distinct from 'approved'
 and exists(select 1 from public.partner_driver_registrations where driver_id=new.id and status<>'approved') then
  raise exception 'Use Partner driver review to approve this driver after document verification';
 end if;
 return new;
end $$;
revoke all on function private.guard_partner_driver_approval() from public,anon,authenticated;
create trigger profiles_partner_driver_approval before update of driver_status on public.profiles
 for each row execute function private.guard_partner_driver_approval();

create function private.require_partner_driver_manager(p_partner_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.partner_organizations where id=p_partner_id and status='active') then
  raise exception 'Active Partner organization required';
 end if;
 if (select private.is_admin_or_ceo()) then
  perform private.require_active_leadership('partner_driver_registration'); return;
 end if;
 if not exists(select 1 from public.partner_memberships m join public.profiles p on p.id=m.user_id
  where m.partner_id=p_partner_id and m.user_id=auth.uid() and m.active and m.member_role in ('owner','admin') and p.role::text='partner') then
  raise exception 'Active Partner owner or admin access required';
 end if;
end $$;
revoke all on function private.require_partner_driver_manager(uuid) from public,anon,authenticated;

create function public.create_partner_driver_registration(p_partner_id uuid,p_full_name text,p_email text,p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.partner_driver_registrations; v_email text:=lower(btrim(coalesce(p_email,''))); v_phone text;
begin
 perform private.require_partner_driver_manager(p_partner_id);
 if length(btrim(coalesce(p_full_name,''))) not between 2 and 120 then raise exception 'Driver name is required'; end if;
 if length(v_email)>254 or v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$' or position('..' in v_email)>0 then raise exception 'Valid driver email required'; end if;
 v_phone:=private.normalize_public_mobile_phone(p_phone);
 if v_phone is null then raise exception 'Valid Ethiopian mobile phone required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_email,0));
 if exists(select 1 from auth.users where lower(email)=v_email) or exists(select 1 from public.partner_driver_registrations where email=v_email) then
  raise exception 'This email already has an account or registration. HALLO Admin must review existing ownership.';
 end if;
 insert into public.partner_driver_registrations(partner_id,full_name,email,phone,created_by)
 values(p_partner_id,btrim(p_full_name),v_email,v_phone,auth.uid()) returning * into v_row;
 insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
 values(p_partner_id,auth.uid(),'partner_driver_invited','partner_driver_registration',v_row.id::text,'{}'::jsonb);
 return jsonb_build_object('id',v_row.id,'token',v_row.invitation_token,'expires_at',v_row.expires_at);
end $$;

-- A private, random invitation token may validate supplied contact details before
-- signup. Return only a boolean; never expose recipient data or mutate accounts.
create function public.validate_partner_driver_registration(p_token uuid,p_email text,p_phone text)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.partner_driver_registrations r
 join public.partner_organizations o on o.id=r.partner_id
 where r.invitation_token=p_token and r.email=lower(btrim(p_email))
 and r.phone=private.normalize_public_mobile_phone(p_phone) and o.status='active'
 and (r.status in ('registered','approved') or (r.status='invited' and r.expires_at>now())))
$$;
revoke all on function public.validate_partner_driver_registration(uuid,text,text) from public;
grant execute on function public.validate_partner_driver_registration(uuid,text,text) to anon,authenticated;

create function public.claim_partner_driver_registration(p_token uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_row public.partner_driver_registrations; v_email text; v_created_at timestamptz; v_confirmed_at timestamptz; v_profile public.profiles;
begin
 if auth.uid() is null then raise exception 'Driver authentication required'; end if;
 select * into v_row from public.partner_driver_registrations where invitation_token=p_token for update;
 if not found then raise exception 'Registration link is invalid'; end if;
 if not exists(select 1 from public.partner_organizations where id=v_row.partner_id and status='active') then raise exception 'Active Partner organization required'; end if;
 select email,created_at,email_confirmed_at into v_email,v_created_at,v_confirmed_at from auth.users where id=auth.uid();
 select * into v_profile from public.profiles where id=auth.uid() for update;
 if lower(v_email) is distinct from v_row.email or v_profile.role::text is distinct from 'driver' then raise exception 'Driver email must match this registration'; end if;
 if v_confirmed_at is null then raise exception 'Confirm your email before completing registration'; end if;
 if v_row.driver_id=auth.uid() and v_row.status in ('registered','approved') then return v_row.id; end if;
 if v_row.status<>'invited' or v_row.expires_at<now() then raise exception 'Registration link is expired or closed'; end if;
 if v_created_at<v_row.created_at or v_profile.driver_status::text is distinct from 'pending' then raise exception 'Existing HALLO accounts cannot be claimed by a Partner'; end if;
 if v_profile.phone is distinct from v_row.phone then raise exception 'Driver phone must match this registration'; end if;
 if exists(select 1 from public.partner_fleet_vehicles where assigned_driver_id=auth.uid()) then raise exception 'Driver already belongs to an existing fleet'; end if;
 update public.partner_driver_registrations set driver_id=auth.uid(),status='registered' where id=v_row.id;
 insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_row.partner_id,auth.uid(),'partner_driver_registered','partner_driver_registration',v_row.id::text,'{}'::jsonb);
 return v_row.id;
end $$;

create function public.list_partner_driver_registrations(p_partner_id uuid default null)
returns table(id uuid,partner_id uuid,partner_name text,full_name text,email text,phone text,status text,driver_id uuid,driver_status text,expires_at timestamptz,review_note text,token uuid)
language plpgsql security definer set search_path='' as $$
begin
 if p_partner_id is null then perform private.require_active_leadership('list_partner_driver_registrations');
 else perform private.require_partner_driver_manager(p_partner_id); end if;
 return query select r.id,r.partner_id,o.name,r.full_name,r.email,r.phone,r.status,r.driver_id,p.driver_status::text,r.expires_at,r.review_note,
 case when r.status='invited' and r.expires_at>now() then r.invitation_token else null end
 from public.partner_driver_registrations r join public.partner_organizations o on o.id=r.partner_id
 left join public.profiles p on p.id=r.driver_id
 where p_partner_id is null or r.partner_id=p_partner_id order by r.created_at desc;
end $$;

create function public.link_partner_driver_onboarding_vehicle(p_registration_id uuid,p_truck_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.partner_driver_registrations; v_truck public.trucks; v_fleet public.partner_fleet_vehicles; v_driver_status text;
begin
 perform private.require_active_leadership('link_partner_driver_onboarding_vehicle');
 select * into v_row from public.partner_driver_registrations where id=p_registration_id for update;
 if not found or v_row.driver_id is null or v_row.status not in ('registered','approved') then raise exception 'Registered Partner driver required'; end if;
 perform private.require_partner_driver_manager(v_row.partner_id);
 select driver_status::text into v_driver_status from public.profiles where id=v_row.driver_id and role::text='driver' for update;
 if v_driver_status not in ('pending','approved') or v_driver_status is null then raise exception 'Active Partner driver required'; end if;
 select * into v_truck from public.trucks where id=p_truck_id for update;
 if not found or v_truck.partner_id is distinct from v_row.partner_id then raise exception 'Truck must belong to this Partner'; end if;
 select * into v_fleet from public.partner_fleet_vehicles where truck_id=p_truck_id and partner_id=v_row.partner_id for update;
 if not found then raise exception 'Canonical Partner fleet link required'; end if;
 if (v_truck.driver_id is not null and v_truck.driver_id<>v_row.driver_id)
 or (v_fleet.assigned_driver_id is not null and v_fleet.assigned_driver_id<>v_row.driver_id) then raise exception 'Vehicle belongs to another driver'; end if;
 if v_truck.status::text in ('on_trip','maintenance','suspended') or v_fleet.status::text in ('on_trip','maintenance','suspended') then raise exception 'Vehicle is not available for onboarding'; end if;
 if exists(select 1 from public.trucks where driver_id=v_row.driver_id and id<>p_truck_id) then raise exception 'Driver already has another vehicle'; end if;
 if exists(select 1 from public.orders where (truck_id=p_truck_id or driver_id=v_row.driver_id) and status::text in ('accepted','in_transit')) then raise exception 'Vehicle or driver has an active trip'; end if;
 perform set_config('app.fleet_change_source','admin',true);
 perform set_config('app.fleet_change_reason','Partner driver onboarding vehicle link',true);
 update public.trucks set driver_id=v_row.driver_id,updated_at=now() where id=p_truck_id;
 update public.partner_fleet_vehicles set assigned_driver_id=v_row.driver_id where id=v_fleet.id;
 if v_driver_status='pending' then
  update public.trucks set status='inactive',updated_at=now() where id=p_truck_id;
  update public.partner_fleet_vehicles set status='inactive' where id=v_fleet.id;
 end if;
 insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_row.partner_id,auth.uid(),'partner_driver_vehicle_linked','partner_driver_registration',v_row.id::text,jsonb_build_object('truck_id',p_truck_id));
end $$;
revoke all on function public.link_partner_driver_onboarding_vehicle(uuid,uuid) from public,anon;
grant execute on function public.link_partner_driver_onboarding_vehicle(uuid,uuid) to authenticated;

create function public.review_partner_driver_registration(p_registration_id uuid,p_decision text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.partner_driver_registrations;
begin
 if auth.uid() is null or not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
 perform private.require_active_leadership('review_partner_driver_registration');
 if p_decision not in ('approved','rejected') or p_decision is null then raise exception 'Invalid review decision'; end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Review reason is required'; end if;
 select * into v_row from public.partner_driver_registrations where id=p_registration_id for update;
 if not found or v_row.status not in ('invited','registered') then raise exception 'Pending registration not found'; end if;
 perform private.require_partner_driver_manager(v_row.partner_id);
 if p_decision='approved' and (v_row.driver_id is null or v_row.status<>'registered') then
  raise exception 'Driver signup must finish before approval';
 end if;
 update public.partner_driver_registrations set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_reason) where id=v_row.id;
 if p_decision='approved' then
  -- Existing identity/vehicle document and leadership guards remain authoritative.
  -- A failure rolls back registration approval and all profile/vehicle changes.
  perform public.admin_approve_driver_onboarding(v_row.driver_id);
 end if;
 insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_row.partner_id,auth.uid(),'partner_driver_'||p_decision,'partner_driver_registration',v_row.id::text,jsonb_build_object('reason',btrim(p_reason)));
end $$;
revoke all on function public.create_partner_driver_registration(uuid,text,text,text),public.claim_partner_driver_registration(uuid),public.list_partner_driver_registrations(uuid),public.review_partner_driver_registration(uuid,text,text) from public,anon;
grant execute on function public.create_partner_driver_registration(uuid,text,text,text),public.claim_partner_driver_registration(uuid),public.list_partner_driver_registrations(uuid),public.review_partner_driver_registration(uuid,text,text) to authenticated;
commit;
