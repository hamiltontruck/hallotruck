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

-- Fail the migration if a known Partner finance consumer no longer delegates to
-- this helper. This keeps wallet, settlements, fleet and commission policy
-- coverage explicit without rewriting otherwise-correct policies.
do $verification$
declare
  v_missing text[];
begin
  select array_agg(expected.policy_name order by expected.policy_name)
    into v_missing
  from (
    values
      ('public', 'partner_commission_rules', 'partner_commission_rules_select'),
      ('public', 'partner_fleet_vehicles', 'partner_fleet_select'),
      ('public', 'partner_freight_earnings', 'partner_earnings_select'),
      ('public', 'partner_settlements', 'partner_settlements_select'),
      ('public', 'partner_settlement_events', 'partner_settlement_events_authorized_read'),
      ('public', 'partner_settlement_payments', 'partner_settlement_payments_authorized_read')
  ) as expected(schema_name, table_name, policy_name)
  left join pg_catalog.pg_policies policy
    on policy.schemaname = expected.schema_name
   and policy.tablename = expected.table_name
   and policy.policyname = expected.policy_name
  where policy.policyname is null
     or (
       coalesce(policy.qual, '') not ilike '%can_view_partner_finance%'
       and coalesce(policy.with_check, '') not ilike '%can_view_partner_finance%'
     );

  if v_missing is not null then
    raise exception 'Partner finance policies missing hardened helper coverage: %', v_missing;
  end if;
end;
$verification$;

commit;
