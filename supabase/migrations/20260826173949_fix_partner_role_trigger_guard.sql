-- Allow the audited Partner onboarding RPC to perform its narrowly-scoped
-- Customer/Driver -> Partner role transition without weakening direct profile edits.

create or replace function public.guard_leadership_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce(auth.jwt()->'app_metadata'->>'role', '');
  v_partner_promotion_target text := current_setting(
    'hallotruck.partner_role_promotion_profile_id',
    true
  );
begin
  -- Preserve normal self-profile edits governed by the existing self-update RLS policy.
  if auth.uid() = old.id then
    return new;
  end if;

  if v_actor_role in ('admin', 'ceo') then
    -- This transaction-local marker can only be set by the authorization-checked
    -- onboarding RPC. It permits exactly one role field transition for that profile.
    if v_partner_promotion_target = old.id::text
      and old.role::text in ('customer', 'driver')
      and new.role::text = 'partner'
      and (to_jsonb(new) - 'role') is not distinct from (to_jsonb(old) - 'role')
    then
      return new;
    end if;

    if old.role::text <> 'driver' or new.role::text <> 'driver' then
      raise exception 'Leadership may only change driver approval status through this profile update path';
    end if;

    -- Direct leadership profile updates remain limited to driver_status only.
    if new.id is distinct from old.id
      or new.full_name is distinct from old.full_name
      or new.phone is distinct from old.phone
      or new.vehicle_type is distinct from old.vehicle_type
      or new.rating_avg is distinct from old.rating_avg
      or new.created_at is distinct from old.created_at
      or new.email is distinct from old.email
      or new.home_address is distinct from old.home_address
      or new.customer_type is distinct from old.customer_type
      or new.company_name is distinct from old.company_name
    then
      raise exception 'Admin approval may only change driver_status';
    end if;

    return new;
  end if;

  return new;
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
  if not found then
    raise exception using errcode = 'P0002', message = 'Partner organization was not found.';
  end if;

  select role into v_current_role from public.profiles where id = p_user_id for update;
  if v_current_role is null then
    raise exception using errcode = 'P0002', message = 'Partner account was not found.';
  end if;
  if v_current_role::text in ('admin', 'ceo') then
    raise exception using errcode = '42501', message = 'Admin and CEO roles are protected and cannot be replaced.';
  end if;
  if v_current_role::text not in ('customer', 'driver', 'partner') then
    raise exception using errcode = '22023', message = 'Only Customer, Driver or existing Partner accounts can be onboarded.';
  end if;
  if v_current_role::text <> 'partner' and not p_confirm_role_replacement then
    raise exception using errcode = '22023', message = 'Confirm the Customer or Driver portal role replacement before onboarding.';
  end if;
  if exists (
    select 1
    from public.partner_memberships
    where partner_id = p_partner_id
      and user_id = p_user_id
  ) then
    raise exception using errcode = '23505', message = 'This account already belongs to the selected organization.';
  end if;

  if v_current_role::text <> 'partner' then
    perform set_config(
      'hallotruck.partner_role_promotion_profile_id',
      p_user_id::text,
      true
    );
    update public.profiles set role = 'partner' where id = p_user_id;
    perform set_config('hallotruck.partner_role_promotion_profile_id', '', true);

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'partner')
    where id = p_user_id;
  end if;

  insert into public.partner_memberships (
    partner_id,
    user_id,
    member_role,
    active,
    invited_by,
    profile_role_before_partner
  ) values (
    p_partner_id,
    p_user_id,
    p_member_role,
    p_active,
    auth.uid(),
    case when v_current_role::text = 'partner' then null else v_current_role end
  ) returning id into membership_id;

  if v_current_role::text <> 'partner' then
    insert into public.partner_activity_log (
      partner_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      p_partner_id,
      auth.uid(),
      'profile_role_changed',
      'profile',
      p_user_id::text,
      jsonb_build_object('previous_role', v_current_role::text, 'new_role', 'partner')
    );
  end if;
  insert into public.partner_activity_log (
    partner_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_partner_id,
    auth.uid(),
    'membership_created',
    'membership',
    membership_id::text,
    jsonb_build_object(
      'user_id', p_user_id,
      'permission', p_member_role::text,
      'active', p_active
    )
  );
  return membership_id;
end;
$$;

revoke all on function public.guard_leadership_profile_update() from public, anon, authenticated;

revoke all on function public.admin_onboard_partner_member(
  uuid,
  uuid,
  public.partner_member_role,
  boolean,
  boolean
) from public, anon;

grant execute on function public.admin_onboard_partner_member(
  uuid,
  uuid,
  public.partner_member_role,
  boolean,
  boolean
) to authenticated;
