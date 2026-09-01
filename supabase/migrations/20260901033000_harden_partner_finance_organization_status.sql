-- Harden Partner finance reads so an active membership cannot outlive the organization.
-- Active Admin/CEO access is preserved for operational review and remediation.

create or replace function public.can_view_partner_finance(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin_or_ceo())
    or exists (
      select 1
      from public.partner_memberships membership
      join public.partner_organizations organization
        on organization.id = membership.partner_id
      where membership.partner_id = p_partner_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.member_role in ('owner', 'admin')
        and organization.status::text = 'active'
    );
$$;

revoke all on function public.can_view_partner_finance(uuid) from public, anon;
grant execute on function public.can_view_partner_finance(uuid) to authenticated, service_role;

comment on function public.can_view_partner_finance(uuid) is
  'Allows active Admin/CEO users, or active Partner owners/admins whose organization is active.';
