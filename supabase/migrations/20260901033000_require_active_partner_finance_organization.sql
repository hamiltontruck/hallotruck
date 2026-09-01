-- Partner finance authorization hardening.
--
-- Active Partner owners/admins may read only their own organization's finance,
-- fleet, settlement and commission rows. Suspended or archived organizations
-- fail closed even when an active membership row still exists.
--
-- This migration replaces one authorization helper only. It does not mutate
-- partner, financial, order, payment, settlement, fleet, commission or audit data.

begin;

create or replace function public.can_view_partner_finance(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
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
        and organization.status = 'active'
    );
$function$;

revoke all on function public.can_view_partner_finance(uuid)
  from public, anon;
grant execute on function public.can_view_partner_finance(uuid)
  to authenticated, service_role;

comment on function public.can_view_partner_finance(uuid) is
  'Allows active Admin/CEO leadership or an active owner/admin membership in the same active Partner organization. Suspended and archived organizations fail closed.';

commit;
