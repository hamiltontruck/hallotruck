begin;

do $$
begin
  if exists (
    select rule.partner_id
    from public.partner_commission_rules rule
    where rule.active
    group by rule.partner_id
    having count(*) > 1
  ) then
    raise exception 'Partner commission rules contain multiple active rows for one organization';
  end if;
end
$$;

create unique index if not exists partner_commission_rules_one_active_per_partner
  on public.partner_commission_rules(partner_id)
  where active;

create or replace function public.admin_activate_partner_commission_rule(
  p_partner_id uuid,
  p_commission_type text,
  p_commission_value numeric,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_type text := lower(btrim(coalesce(p_commission_type, '')));
  v_effective_from date := coalesce(p_effective_from, current_date);
  v_previous public.partner_commission_rules%rowtype;
  v_rule_id uuid;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception using errcode = '42501', message = 'Admin or CEO authorization is required.';
  end if;

  if p_partner_id is null then
    raise exception using errcode = '22023', message = 'Partner organization is required.';
  end if;

  if not exists (
    select 1
    from public.partner_organizations organization
    where organization.id = p_partner_id
      and organization.status::text = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Active Partner organization not found.';
  end if;

  if v_type not in ('percentage', 'fixed') then
    raise exception using errcode = '22023', message = 'Commission type must be percentage or fixed.';
  end if;

  if p_commission_value is null or p_commission_value < 0 then
    raise exception using errcode = '22023', message = 'Commission value must be zero or greater.';
  end if;

  if v_type = 'percentage' and p_commission_value > 100 then
    raise exception using errcode = '22023', message = 'Percentage commission cannot exceed 100.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-commission:' || p_partner_id::text, 0)
  );

  select rule.*
  into v_previous
  from public.partner_commission_rules rule
  where rule.partner_id = p_partner_id
    and rule.active
  order by rule.effective_from desc, rule.created_at desc
  limit 1
  for update;

  if found then
    if v_effective_from < v_previous.effective_from then
      raise exception using errcode = '22023', message = 'New rule cannot start before the active rule.';
    end if;

    update public.partner_commission_rules
    set active = false,
        effective_to = case
          when v_effective_from > v_previous.effective_from then v_effective_from - 1
          else v_previous.effective_from
        end,
        updated_at = now()
    where id = v_previous.id;
  end if;

  insert into public.partner_commission_rules(
    partner_id,
    commission_type,
    commission_value,
    applies_to,
    effective_from,
    effective_to,
    active,
    created_by
  ) values (
    p_partner_id,
    v_type,
    round(p_commission_value, 2),
    'hallo_generated_freight',
    v_effective_from,
    null,
    true,
    v_actor
  )
  returning id into v_rule_id;

  insert into public.partner_activity_log(
    partner_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_partner_id,
    v_actor,
    'partner_commission_rule_activated',
    'partner_commission_rule',
    v_rule_id::text,
    jsonb_build_object(
      'previous_rule_id', v_previous.id,
      'previous_type', v_previous.commission_type,
      'previous_value', v_previous.commission_value,
      'new_rule_id', v_rule_id,
      'new_type', v_type,
      'new_value', round(p_commission_value, 2),
      'effective_from', v_effective_from
    )
  );

  return v_rule_id;
end;
$$;

revoke all on function public.admin_activate_partner_commission_rule(uuid, text, numeric, date)
  from public, anon;
grant execute on function public.admin_activate_partner_commission_rule(uuid, text, numeric, date)
  to authenticated, service_role;

revoke insert, update, delete on table public.partner_commission_rules
  from authenticated;
grant select on table public.partner_commission_rules
  to authenticated;

commit;
