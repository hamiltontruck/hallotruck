begin;
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
commit;
notify pgrst,'reload schema';
