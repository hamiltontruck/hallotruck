-- Qualify every ledger column so PL/pgSQL output parameters cannot shadow it.
-- Align Partner finance leadership checks with the database-backed Admin/CEO gate.
-- Membership isolation and immutable financial rows remain unchanged.

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
      where membership.partner_id = p_partner_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.member_role in ('owner', 'admin')
    );
$$;

revoke all on function public.can_view_partner_finance(uuid) from public, anon;
grant execute on function public.can_view_partner_finance(uuid) to authenticated;

alter policy partner_commission_rules_admin_insert
on public.partner_commission_rules
with check ((select private.is_admin_or_ceo()));

alter policy partner_commission_rules_admin_update
on public.partner_commission_rules
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

alter policy partner_fleet_admin_insert
on public.partner_fleet_vehicles
with check ((select private.is_admin_or_ceo()));

alter policy partner_fleet_admin_update
on public.partner_fleet_vehicles
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

alter policy partner_earnings_admin_insert
on public.partner_freight_earnings
with check ((select private.is_admin_or_ceo()));

alter policy partner_earnings_admin_update
on public.partner_freight_earnings
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

alter policy partner_settlements_admin_insert
on public.partner_settlements
with check ((select private.is_admin_or_ceo()));

alter policy partner_settlements_admin_update
on public.partner_settlements
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

create or replace function public.partner_wallet_summary(p_partner_id uuid)
returns table(
  gross_etb numeric,
  hallo_commission_etb numeric,
  partner_net_etb numeric,
  pending_settlement_etb numeric,
  paid_settlement_etb numeric,
  payable_etb numeric,
  fleet_total bigint,
  fleet_available bigint,
  hallo_freight_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_partner_finance(p_partner_id) then
    raise exception 'Partner finance access denied';
  end if;

  return query
  with earning_totals as (
    select
      coalesce(sum(earning.gross_etb) filter (where earning.status <> 'reversed'), 0)::numeric as gross,
      coalesce(sum(earning.hallo_commission_etb) filter (where earning.status <> 'reversed'), 0)::numeric as commission,
      coalesce(sum(earning.partner_net_etb) filter (where earning.status <> 'reversed'), 0)::numeric as net,
      count(*) filter (where earning.status <> 'reversed')::bigint as freight_count
    from public.partner_freight_earnings earning
    where earning.partner_id = p_partner_id
  ), settlement_totals as (
    select
      coalesce(sum(settlement.amount_etb) filter (where settlement.status = 'pending'), 0)::numeric as pending,
      coalesce(sum(settlement.amount_etb) filter (where settlement.status = 'paid'), 0)::numeric as paid
    from public.partner_settlements settlement
    where settlement.partner_id = p_partner_id
  ), fleet_totals as (
    select
      count(*)::bigint as total,
      count(*) filter (where vehicle.status = 'available')::bigint as available
    from public.partner_fleet_vehicles vehicle
    where vehicle.partner_id = p_partner_id
  )
  select
    earning_totals.gross,
    earning_totals.commission,
    earning_totals.net,
    settlement_totals.pending,
    settlement_totals.paid,
    greatest(earning_totals.net - settlement_totals.paid - settlement_totals.pending, 0),
    fleet_totals.total,
    fleet_totals.available,
    earning_totals.freight_count
  from earning_totals, settlement_totals, fleet_totals;
end;
$$;

revoke all on function public.partner_wallet_summary(uuid) from public, anon;
grant execute on function public.partner_wallet_summary(uuid) to authenticated;

comment on function public.partner_wallet_summary(uuid) is
  'Authorized Partner wallet totals with fully qualified immutable ledger columns.';

create or replace function public.admin_record_partner_freight(
  p_partner_id uuid,
  p_order_id uuid,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.partner_commission_rules%rowtype;
  v_gross numeric;
  v_commission numeric;
  v_earning_id uuid;
  v_actor uuid := auth.uid();
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  select * into v_rule
  from public.partner_commission_rules rule
  where rule.partner_id = p_partner_id
    and rule.active
    and rule.effective_from <= current_date
    and (rule.effective_to is null or rule.effective_to >= current_date)
  order by rule.effective_from desc, rule.created_at desc
  limit 1;
  if not found then raise exception 'No active partner commission rule'; end if;

  select coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0)
  into v_gross
  from public.payments payment
  where payment.order_id = p_order_id;
  if v_gross <= 0 then raise exception 'Order has no released payment'; end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.partner_fleet_vehicles vehicle
    where vehicle.id = p_vehicle_id and vehicle.partner_id = p_partner_id
  ) then raise exception 'Vehicle does not belong to partner'; end if;

  v_commission := case
    when v_rule.commission_type = 'percentage' then round(v_gross * v_rule.commission_value / 100, 2)
    else least(v_rule.commission_value, v_gross)
  end;

  insert into public.partner_freight_earnings(
    partner_id, order_id, vehicle_id, gross_etb, commission_type,
    commission_value, hallo_commission_etb, partner_net_etb, created_by
  ) values (
    p_partner_id, p_order_id, p_vehicle_id, v_gross, v_rule.commission_type,
    v_rule.commission_value, v_commission, v_gross - v_commission, v_actor
  ) returning id into v_earning_id;

  insert into public.partner_activity_log(partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_partner_id, v_actor, 'partner_freight_accrued', 'partner_freight', v_earning_id::text,
    jsonb_build_object('order_id', p_order_id, 'gross_etb', v_gross, 'hallo_commission_etb', v_commission));
  return v_earning_id;
end;
$$;

create or replace function public.admin_create_partner_settlement(
  p_partner_id uuid,
  p_amount_etb numeric,
  p_provider text,
  p_transaction_ref text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_summary record;
  v_settlement_id uuid;
  v_actor uuid := auth.uid();
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_amount_etb <= 0 then raise exception 'Settlement amount must be positive'; end if;

  select * into v_summary from public.partner_wallet_summary(p_partner_id);
  if p_amount_etb > v_summary.payable_etb then
    raise exception 'Settlement exceeds partner payable balance';
  end if;

  insert into public.partner_settlements(
    partner_id, amount_etb, status, provider, transaction_ref, note, created_by
  ) values (
    p_partner_id, p_amount_etb, 'pending', nullif(btrim(p_provider), ''),
    nullif(btrim(p_transaction_ref), ''), nullif(btrim(p_note), ''), v_actor
  ) returning id into v_settlement_id;

  insert into public.partner_activity_log(partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_partner_id, v_actor, 'partner_settlement_created', 'partner_settlement', v_settlement_id::text,
    jsonb_build_object('amount_etb', p_amount_etb));
  return v_settlement_id;
end;
$$;

create or replace function public.admin_mark_partner_settlement_paid(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.partner_settlements%rowtype;
  v_actor uuid := auth.uid();
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  select * into v_settlement
  from public.partner_settlements settlement
  where settlement.id = p_settlement_id
  for update;
  if not found then raise exception 'Settlement not found'; end if;
  if v_settlement.status <> 'pending' then raise exception 'Only pending settlements can be paid'; end if;

  update public.partner_settlements
  set status = 'paid', approved_by = v_actor, paid_at = now(), updated_at = now()
  where id = p_settlement_id;

  insert into public.partner_activity_log(partner_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_settlement.partner_id, v_actor, 'partner_settlement_paid', 'partner_settlement', p_settlement_id::text,
    jsonb_build_object('amount_etb', v_settlement.amount_etb));
end;
$$;

revoke all on function public.admin_record_partner_freight(uuid, uuid, uuid) from public, anon;
revoke all on function public.admin_create_partner_settlement(uuid, numeric, text, text, text) from public, anon;
revoke all on function public.admin_mark_partner_settlement_paid(uuid) from public, anon;
grant execute on function public.admin_record_partner_freight(uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_create_partner_settlement(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.admin_mark_partner_settlement_paid(uuid) to authenticated;

notify pgrst, 'reload schema';
