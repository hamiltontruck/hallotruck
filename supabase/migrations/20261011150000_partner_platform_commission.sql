-- Partner-origin platform fee only. Existing earned rows and other rules are unchanged.
begin;

create or replace function private.record_partner_freight_internal(
  p_partner_id uuid,
  p_order_id uuid,
  p_vehicle_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_rule public.partner_commission_rules%rowtype;
  v_gross numeric;
  v_commission numeric;
  v_earning_id uuid;
  v_platform_partner uuid;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  -- Only Partner-origin platform orders receive the platform fee.
  select partner_order.partner_id into v_platform_partner
  from public.partner_orders partner_order
  where partner_order.canonical_order_id = p_order_id;
  if found then
    if v_platform_partner is distinct from p_partner_id then
      raise exception 'Platform order belongs to another Partner' using errcode = '42501';
    end if;
    v_rule.commission_type := 'percentage';
    v_rule.commission_value := 0.25;
  else
    -- Existing HALLO-generated freight rules remain unchanged.
    select * into v_rule
    from public.partner_commission_rules rule
    where rule.partner_id = p_partner_id
      and rule.active
      and rule.effective_from <= current_date
      and (rule.effective_to is null or rule.effective_to >= current_date)
    order by rule.effective_from desc, rule.created_at desc
    limit 1;
    if not found then raise exception 'No active Partner commission rule'; end if;
  end if;

  select coalesce(sum(case
    when payment.event = 'released' then payment.amount_etb
    when payment.event = 'refunded' then -payment.amount_etb
    else 0 end), 0)
  into v_gross
  from public.payments payment
  where payment.order_id = p_order_id;
  if v_gross <= 0 then
    raise exception 'Order has no effective released payment';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.partner_fleet_vehicles vehicle
    where vehicle.id = p_vehicle_id and vehicle.partner_id = p_partner_id
  ) then raise exception 'Vehicle does not belong to Partner organization'; end if;

  if p_project_id is not null and not exists (
    select 1 from public.partner_projects project
    where project.id = p_project_id and project.partner_id = p_partner_id
  ) then raise exception 'Project does not belong to Partner organization'; end if;

  v_commission := case
    when v_rule.commission_type = 'percentage'
      then round(v_gross * v_rule.commission_value / 100, 2)
    else least(v_rule.commission_value, v_gross)
  end;

  insert into public.partner_freight_earnings(
    partner_id, project_id, order_id, vehicle_id, gross_etb,
    commission_type, commission_value, hallo_commission_etb,
    partner_net_etb, created_by
  ) values (
    p_partner_id, p_project_id, p_order_id, p_vehicle_id, round(v_gross, 2),
    v_rule.commission_type, v_rule.commission_value, v_commission,
    round(v_gross - v_commission, 2), v_actor
  ) returning id into v_earning_id;

  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_partner_id, v_actor, 'partner_freight_accrued',
    'partner_freight', v_earning_id::text,
    jsonb_build_object(
      'order_id', p_order_id,
      'project_id', p_project_id,
      'gross_etb', round(v_gross, 2),
      'hallo_commission_etb', v_commission
    )
  );
  return v_earning_id;
end;
$$;

revoke all on function private.record_partner_freight_internal(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

commit;
