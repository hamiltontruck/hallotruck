-- Production Partner onboarding is executed only through database-authorized RPCs.
-- Authorization deliberately reads public.profiles.role; JWT user metadata is not trusted.

alter table public.partner_memberships
  add column if not exists profile_role_before_partner public.user_role;

create index if not exists partner_memberships_partner_owner_idx
  on public.partner_memberships (partner_id, active, member_role);

create index if not exists partner_organizations_status_name_idx
  on public.partner_organizations (status, name);

create or replace function private.is_partner_member(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.partner_memberships membership
      join public.partner_organizations organization on organization.id = membership.partner_id
      where membership.partner_id = p_partner_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and organization.status = 'active'
    );
$$;

create or replace function private.can_manage_partner(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_or_ceo()
    or exists (
      select 1
      from public.partner_memberships membership
      join public.partner_organizations organization on organization.id = membership.partner_id
      where membership.partner_id = p_partner_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.member_role in ('owner', 'admin', 'editor')
        and organization.status = 'active'
    );
$$;

create or replace function private.guard_partner_final_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_active_owners integer;
  removes_active_owner boolean := false;
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.partner_memberships membership
      where membership.partner_id = new.partner_id
        and membership.active
        and membership.member_role = 'owner'
    ) and not (new.active and new.member_role = 'owner') then
      raise exception using errcode = '23514', message = 'The first active membership must be an owner.';
    end if;
    return new;
  end if;

  if old.active and old.member_role = 'owner' then
    if tg_op = 'DELETE' then
      removes_active_owner := true;
    else
      removes_active_owner := not new.active or new.member_role <> 'owner';
    end if;
  end if;

  if removes_active_owner then
    select count(*) into other_active_owners
    from public.partner_memberships membership
    where membership.partner_id = old.partner_id
      and membership.id <> old.id
      and membership.active
      and membership.member_role = 'owner';
    if other_active_owners = 0 then
      raise exception using errcode = '23514', message = 'Transfer ownership first. The final active owner cannot be disabled, demoted or removed.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists partner_memberships_final_owner_guard on public.partner_memberships;
create trigger partner_memberships_final_owner_guard
before insert or update or delete on public.partner_memberships
for each row execute function private.guard_partner_final_owner();
revoke all on function private.guard_partner_final_owner() from public, anon, authenticated;

create or replace function private.guard_partner_tenant_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
begin
  if tg_table_name in ('partner_project_progress', 'partner_payments', 'partner_folders', 'partner_documents', 'partner_messages')
    and nullif(row_data ->> 'project_id', '') is not null
    and not exists (select 1 from public.partner_projects project where project.id = (row_data ->> 'project_id')::uuid and project.partner_id = (row_data ->> 'partner_id')::uuid) then
    raise exception using errcode = '23514', message = 'Project does not belong to the selected Partner organization.';
  end if;
  if tg_table_name = 'partner_folders' and nullif(row_data ->> 'parent_id', '') is not null
    and not exists (select 1 from public.partner_folders folder where folder.id = (row_data ->> 'parent_id')::uuid and folder.partner_id = (row_data ->> 'partner_id')::uuid) then
    raise exception using errcode = '23514', message = 'Parent folder does not belong to the selected Partner organization.';
  end if;
  if tg_table_name = 'partner_documents' and nullif(row_data ->> 'folder_id', '') is not null
    and not exists (select 1 from public.partner_folders folder where folder.id = (row_data ->> 'folder_id')::uuid and folder.partner_id = (row_data ->> 'partner_id')::uuid) then
    raise exception using errcode = '23514', message = 'Folder does not belong to the selected Partner organization.';
  end if;
  if tg_table_name = 'partner_document_reviews'
    and not exists (select 1 from public.partner_documents document where document.id = (row_data ->> 'document_id')::uuid and document.partner_id = (row_data ->> 'partner_id')::uuid) then
    raise exception using errcode = '23514', message = 'Document does not belong to the selected Partner organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists partner_progress_tenant_guard on public.partner_project_progress;
create trigger partner_progress_tenant_guard before insert or update on public.partner_project_progress for each row execute function private.guard_partner_tenant_relationships();
drop trigger if exists partner_payments_tenant_guard on public.partner_payments;
create trigger partner_payments_tenant_guard before insert or update on public.partner_payments for each row execute function private.guard_partner_tenant_relationships();
drop trigger if exists partner_folders_tenant_guard on public.partner_folders;
create trigger partner_folders_tenant_guard before insert or update on public.partner_folders for each row execute function private.guard_partner_tenant_relationships();
drop trigger if exists partner_documents_tenant_guard on public.partner_documents;
create trigger partner_documents_tenant_guard before insert or update on public.partner_documents for each row execute function private.guard_partner_tenant_relationships();
drop trigger if exists partner_reviews_tenant_guard on public.partner_document_reviews;
create trigger partner_reviews_tenant_guard before insert or update on public.partner_document_reviews for each row execute function private.guard_partner_tenant_relationships();
drop trigger if exists partner_messages_tenant_guard on public.partner_messages;
create trigger partner_messages_tenant_guard before insert or update on public.partner_messages for each row execute function private.guard_partner_tenant_relationships();
revoke all on function private.guard_partner_tenant_relationships() from public, anon, authenticated;

create or replace function public.admin_search_partner_profiles(
  p_query text default '',
  p_limit integer default 20
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  profile_role text,
  account_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := left(btrim(coalesce(p_query, '')), 100);
  result_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  if char_length(normalized_query) < 2 then return; end if;

  return query
  select profile.id,
         profile.full_name,
         profile.email,
         profile.phone,
         profile.role::text,
         case when profile.role::text = 'driver'
           then coalesce(profile.driver_status::text, 'pending')
           else 'active'
         end
  from public.profiles profile
  where profile.full_name ilike '%' || normalized_query || '%'
     or coalesce(profile.email, '') ilike '%' || normalized_query || '%'
     or profile.phone ilike '%' || normalized_query || '%'
  order by profile.full_name, profile.created_at
  limit result_limit;
end;
$$;

create or replace function public.admin_partner_organization_overview()
returns table (
  id uuid,
  name text,
  code text,
  status text,
  contact_email text,
  contact_phone text,
  created_at timestamptz,
  owner_name text,
  active_member_count bigint,
  partner_role_count bigint,
  active_owner_count bigint,
  project_count bigint,
  pending_document_count bigint,
  pending_payment_count bigint,
  latest_activity text,
  latest_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;

  return query
  select organization.id,
         organization.name,
         organization.code,
         organization.status,
         organization.contact_email,
         organization.contact_phone,
         organization.created_at,
         (
           select profile.full_name
           from public.partner_memberships membership
           join public.profiles profile on profile.id = membership.user_id
           where membership.partner_id = organization.id
             and membership.active
             and membership.member_role = 'owner'
           order by membership.created_at
           limit 1
         ),
         (select count(*) from public.partner_memberships membership where membership.partner_id = organization.id and membership.active),
         (select count(*) from public.partner_memberships membership join public.profiles profile on profile.id = membership.user_id where membership.partner_id = organization.id and profile.role::text = 'partner'),
         (select count(*) from public.partner_memberships membership where membership.partner_id = organization.id and membership.active and membership.member_role = 'owner'),
         (select count(*) from public.partner_projects project where project.partner_id = organization.id),
         (select count(*) from public.partner_documents document where document.partner_id = organization.id and document.status = 'pending'),
         (select count(*) from public.partner_payments payment where payment.partner_id = organization.id and payment.status in ('pending', 'approved')),
         (select activity.action from public.partner_activity_log activity where activity.partner_id = organization.id order by activity.created_at desc, activity.id desc limit 1),
         (select activity.created_at from public.partner_activity_log activity where activity.partner_id = organization.id order by activity.created_at desc, activity.id desc limit 1)
  from public.partner_organizations organization
  order by organization.created_at desc;
end;
$$;

create or replace function public.admin_partner_members(p_partner_id uuid)
returns table (
  id uuid,
  partner_id uuid,
  user_id uuid,
  member_role text,
  active boolean,
  created_at timestamptz,
  full_name text,
  email text,
  phone text,
  profile_role text,
  account_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  return query
  select membership.id,
         membership.partner_id,
         membership.user_id,
         membership.member_role::text,
         membership.active,
         membership.created_at,
         profile.full_name,
         profile.email,
         profile.phone,
         profile.role::text,
         case when profile.role::text = 'driver'
           then coalesce(profile.driver_status::text, 'pending')
           else 'active'
         end
  from public.partner_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.partner_id = p_partner_id
  order by membership.active desc, membership.member_role = 'owner' desc, profile.full_name;
end;
$$;

create or replace function public.admin_create_partner_organization(
  p_name text,
  p_code text,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_code text := upper(btrim(coalesce(p_code, '')));
  normalized_email text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  normalized_phone text := nullif(btrim(coalesce(p_contact_phone, '')), '');
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  if char_length(normalized_name) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'Organization name must contain 2–160 characters.';
  end if;
  if normalized_code !~ '^[A-Z0-9][A-Z0-9_-]{1,39}$' then
    raise exception using errcode = '22023', message = 'Organization code must contain 2–40 uppercase letters, numbers, hyphens or underscores.';
  end if;
  if normalized_email is not null
    and normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid contact email address.';
  end if;
  if normalized_phone is not null
    and char_length(normalized_phone) not between 7 and 30 then
    raise exception using errcode = '22023', message = 'Contact phone must contain 7–30 characters.';
  end if;
  if coalesce(p_status, '') not in ('active', 'suspended', 'archived') then
    raise exception using errcode = '22023', message = 'Invalid organization status.';
  end if;

  begin
    insert into public.partner_organizations (name, code, status, contact_email, contact_phone, created_by)
    values (normalized_name, normalized_code, p_status, normalized_email, normalized_phone, auth.uid())
    returning id into organization_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Organization code already exists.';
  end;

  insert into public.partner_activity_log (partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (organization_id, auth.uid(), 'organization_created', 'organization', organization_id::text,
    jsonb_build_object('name', normalized_name, 'code', normalized_code, 'status', p_status));
  return organization_id;
end;
$$;

create or replace function public.admin_onboard_partner_member(
  p_partner_id uuid,
  p_user_id uuid,
  p_member_role public.partner_member_role,
  p_active boolean default true,
  p_confirm_role_replacement boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_id uuid;
  v_current_role public.user_role;
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  perform 1 from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Partner organization was not found.'; end if;

  select role into v_current_role from public.profiles where id = p_user_id for update;
  if v_current_role is null then raise exception using errcode = 'P0002', message = 'Partner account was not found.'; end if;
  if v_current_role::text in ('admin', 'ceo') then
    raise exception using errcode = '42501', message = 'Admin and CEO roles are protected and cannot be replaced.';
  end if;
  if v_current_role::text not in ('customer', 'driver', 'partner') then
    raise exception using errcode = '22023', message = 'Only Customer, Driver or existing Partner accounts can be onboarded.';
  end if;
  if v_current_role::text <> 'partner' and not p_confirm_role_replacement then
    raise exception using errcode = '22023', message = 'Confirm the Customer or Driver portal role replacement before onboarding.';
  end if;
  if exists (select 1 from public.partner_memberships where partner_id = p_partner_id and user_id = p_user_id) then
    raise exception using errcode = '23505', message = 'This account already belongs to the selected organization.';
  end if;

  if v_current_role::text <> 'partner' then
    update public.profiles set role = 'partner' where id = p_user_id;
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'partner')
    where id = p_user_id;
  end if;

  insert into public.partner_memberships (
    partner_id, user_id, member_role, active, invited_by, profile_role_before_partner
  ) values (
    p_partner_id, p_user_id, p_member_role, p_active, auth.uid(),
    case when v_current_role::text = 'partner' then null else v_current_role end
  ) returning id into membership_id;

  if v_current_role::text <> 'partner' then
    insert into public.partner_activity_log (partner_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_partner_id, auth.uid(), 'profile_role_changed', 'profile', p_user_id::text,
      jsonb_build_object('previous_role', v_current_role::text, 'new_role', 'partner'));
  end if;
  insert into public.partner_activity_log (partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_partner_id, auth.uid(), 'membership_created', 'membership', membership_id::text,
    jsonb_build_object('user_id', p_user_id, 'permission', p_member_role::text, 'active', p_active));
  return membership_id;
end;
$$;

create or replace function public.admin_update_partner_membership(
  p_membership_id uuid,
  p_member_role public.partner_member_role,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.partner_memberships%rowtype;
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  select * into existing from public.partner_memberships where id = p_membership_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Partner membership was not found.'; end if;
  if p_active and not exists (select 1 from public.profiles where id = existing.user_id and role::text = 'partner') then
    raise exception using errcode = '23514', message = 'Reactivate the Partner profile role before enabling this membership.';
  end if;

  update public.partner_memberships
  set member_role = p_member_role, active = p_active
  where id = p_membership_id;

  insert into public.partner_activity_log (partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (existing.partner_id, auth.uid(), 'membership_updated', 'membership', existing.id::text,
    jsonb_build_object('previous_permission', existing.member_role::text, 'new_permission', p_member_role::text,
      'previous_active', existing.active, 'new_active', p_active, 'user_id', existing.user_id));
end;
$$;

create or replace function public.admin_transfer_partner_ownership(
  p_partner_id uuid,
  p_from_membership_id uuid,
  p_to_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_member public.partner_memberships%rowtype;
  target_member public.partner_memberships%rowtype;
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  if p_from_membership_id = p_to_membership_id then
    raise exception using errcode = '22023', message = 'Choose a different member to receive ownership.';
  end if;
  perform 1 from public.partner_organizations where id = p_partner_id for update;
  select * into source_member from public.partner_memberships where id = p_from_membership_id and partner_id = p_partner_id for update;
  select * into target_member from public.partner_memberships where id = p_to_membership_id and partner_id = p_partner_id for update;
  if source_member.id is null or not source_member.active or source_member.member_role <> 'owner' then
    raise exception using errcode = '22023', message = 'The current owner membership is invalid.';
  end if;
  if target_member.id is null or not target_member.active then
    raise exception using errcode = '22023', message = 'The new owner must have an active membership.';
  end if;
  if not exists (select 1 from public.profiles where id = target_member.user_id and role::text = 'partner') then
    raise exception using errcode = '23514', message = 'The new owner account must have the Partner profile role.';
  end if;

  update public.partner_memberships set member_role = 'owner' where id = target_member.id;
  update public.partner_memberships set member_role = 'admin' where id = source_member.id;
  insert into public.partner_activity_log (partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_partner_id, auth.uid(), 'ownership_transferred', 'membership', target_member.id::text,
    jsonb_build_object('from_user_id', source_member.user_id, 'to_user_id', target_member.user_id));
end;
$$;

create or replace function public.admin_set_partner_organization_status(
  p_partner_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  if not private.is_admin_or_ceo() then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;
  if coalesce(p_status, '') not in ('active', 'suspended', 'archived') then
    raise exception using errcode = '22023', message = 'Invalid organization status.';
  end if;
  select status into previous_status from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Partner organization was not found.'; end if;
  update public.partner_organizations set status = p_status, updated_at = now() where id = p_partner_id;
  insert into public.partner_activity_log (partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_partner_id, auth.uid(), 'organization_status_changed', 'organization', p_partner_id::text,
    jsonb_build_object('previous_status', previous_status, 'new_status', p_status));
end;
$$;

create or replace function public.partner_login_access()
returns table (
  profile_role text,
  active_membership_count bigint,
  active_organization_count bigint,
  allowed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role::text,
         count(membership.id) filter (where membership.active),
         count(membership.id) filter (where membership.active and organization.status = 'active'),
         profile.role::text = 'partner'
           and count(membership.id) filter (where membership.active and organization.status = 'active') > 0
  from public.profiles profile
  left join public.partner_memberships membership on membership.user_id = profile.id
  left join public.partner_organizations organization on organization.id = membership.partner_id
  where profile.id = auth.uid()
  group by profile.role;
$$;

-- Force organization and membership mutations through the audited RPCs.
revoke insert, update, delete on public.partner_organizations from authenticated;
revoke insert, update, delete on public.partner_memberships from authenticated;
grant select on public.partner_organizations, public.partner_memberships to authenticated;

revoke all on function public.admin_search_partner_profiles(text, integer) from public, anon;
revoke all on function public.admin_partner_organization_overview() from public, anon;
revoke all on function public.admin_partner_members(uuid) from public, anon;
revoke all on function public.admin_create_partner_organization(text, text, text, text, text) from public, anon;
revoke all on function public.admin_onboard_partner_member(uuid, uuid, public.partner_member_role, boolean, boolean) from public, anon;
revoke all on function public.admin_update_partner_membership(uuid, public.partner_member_role, boolean) from public, anon;
revoke all on function public.admin_transfer_partner_ownership(uuid, uuid, uuid) from public, anon;
revoke all on function public.admin_set_partner_organization_status(uuid, text) from public, anon;
revoke all on function public.partner_login_access() from public, anon;

grant execute on function public.admin_search_partner_profiles(text, integer) to authenticated;
grant execute on function public.admin_partner_organization_overview() to authenticated;
grant execute on function public.admin_partner_members(uuid) to authenticated;
grant execute on function public.admin_create_partner_organization(text, text, text, text, text) to authenticated;
grant execute on function public.admin_onboard_partner_member(uuid, uuid, public.partner_member_role, boolean, boolean) to authenticated;
grant execute on function public.admin_update_partner_membership(uuid, public.partner_member_role, boolean) to authenticated;
grant execute on function public.admin_transfer_partner_ownership(uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_set_partner_organization_status(uuid, text) to authenticated;
grant execute on function public.partner_login_access() to authenticated;
