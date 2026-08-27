-- Immutable financial corrections for customer-payment refunds, driver
-- commission reversals, Partner earning corrections and paid-settlement
-- reversals. Original payment, commission, earning and settlement rows remain
-- intact; every correction records its source, actor, amount, time and reason.

create table public.financial_corrections (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  correction_type text not null check (correction_type in (
    'full_refund', 'partial_refund', 'duplicate', 'invalidated',
    'cancelled_order', 'reversed_settlement'
  )),
  source_payment_id uuid references public.payments(id) on delete restrict,
  refund_payment_id uuid unique references public.payments(id) on delete restrict,
  partner_earning_id uuid references public.partner_freight_earnings(id) on delete restrict,
  partner_settlement_id uuid unique references public.partner_settlements(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete restrict,
  partner_id uuid references public.partner_organizations(id) on delete restrict,
  amount_etb numeric(14,2) not null check (amount_etb > 0),
  driver_commission_reversal_etb numeric(14,2) not null default 0
    check (driver_commission_reversal_etb >= 0),
  partner_gross_reversal_etb numeric(14,2) not null default 0
    check (partner_gross_reversal_etb >= 0),
  partner_commission_reversal_etb numeric(14,2) not null default 0
    check (partner_commission_reversal_etb >= 0),
  partner_net_reversal_etb numeric(14,2) not null default 0
    check (partner_net_reversal_etb >= 0),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (
      correction_type = 'reversed_settlement'
      and partner_settlement_id is not null
      and source_payment_id is null
      and refund_payment_id is null
      and order_id is null
    )
    or
    (
      correction_type <> 'reversed_settlement'
      and source_payment_id is not null
      and refund_payment_id is not null
      and partner_settlement_id is null
      and order_id is not null
    )
  ),
  check (round(partner_gross_reversal_etb - partner_commission_reversal_etb, 2)
    = round(partner_net_reversal_etb, 2))
);

create index financial_corrections_source_payment_idx
  on public.financial_corrections(source_payment_id, created_at desc)
  where source_payment_id is not null;
create index financial_corrections_order_idx
  on public.financial_corrections(order_id, created_at desc)
  where order_id is not null;
create index financial_corrections_driver_idx
  on public.financial_corrections(driver_id, created_at desc)
  where driver_id is not null;
create index financial_corrections_partner_idx
  on public.financial_corrections(partner_id, created_at desc)
  where partner_id is not null;
create index financial_corrections_earning_idx
  on public.financial_corrections(partner_earning_id, created_at desc)
  where partner_earning_id is not null;

alter table public.financial_corrections enable row level security;
revoke all on table public.financial_corrections from anon;
revoke insert, update, delete on table public.financial_corrections from authenticated;
grant select on table public.financial_corrections to authenticated;

create policy financial_corrections_authorized_read
on public.financial_corrections
for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or driver_id = (select auth.uid())
  or (
    partner_id is not null
    and exists (
      select 1
      from public.partner_memberships membership
      where membership.partner_id = financial_corrections.partner_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.member_role in ('owner', 'admin')
    )
  )
);

create or replace function private.reject_financial_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Financial history is immutable; create a correction entry instead';
end;
$$;

revoke all on function private.reject_financial_history_mutation()
  from public, anon, authenticated;

create trigger financial_corrections_immutable
before update or delete on public.financial_corrections
for each row execute function private.reject_financial_history_mutation();

create trigger partner_freight_earnings_immutable
before update or delete on public.partner_freight_earnings
for each row execute function private.reject_financial_history_mutation();

revoke update, delete on table public.partner_freight_earnings from authenticated;

create or replace function private.driver_commission_charged_total(
  p_driver_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with canonical as (
    select
      confirmation.payment_id,
      case when confirmation.commission_reversed_at is null
        then round(confirmation.commission_etb, 2) else 0 end as original_commission
    from public.driver_payment_confirmations confirmation
    where confirmation.driver_id = p_driver_id

    union all

    select
      charge.payment_id,
      case when charge.status = 'active'
        then round(charge.commission_etb, 2) else 0 end as original_commission
    from public.driver_commission_charges charge
    where charge.driver_id = p_driver_id
      and not exists (
        select 1
        from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = charge.payment_id
      )
  ), corrected as (
    select
      canonical.payment_id,
      greatest(
        canonical.original_commission - coalesce(sum(correction.driver_commission_reversal_etb), 0),
        0
      ) as effective_commission
    from canonical
    left join public.financial_corrections correction
      on correction.source_payment_id = canonical.payment_id
    group by canonical.payment_id, canonical.original_commission
  )
  select coalesce(sum(corrected.effective_commission), 0)::numeric
  from corrected;
$$;

revoke all on function private.driver_commission_charged_total(uuid)
  from public, anon, authenticated;

create or replace function public.admin_reverse_payment(
  p_payment_id uuid,
  p_amount_etb numeric,
  p_reason text,
  p_correction_type text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_type text := lower(btrim(coalesce(p_correction_type, '')));
  v_amount numeric := round(coalesce(p_amount_etb, 0), 2);
  v_order_id uuid;
  v_order_status public.order_status;
  v_driver_id uuid;
  v_source_amount numeric;
  v_source_event public.payment_event;
  v_already_refunded numeric;
  v_remaining numeric;
  v_original_driver_commission numeric := 0;
  v_prior_driver_reversal numeric := 0;
  v_driver_reversal numeric := 0;
  v_earning_id uuid;
  v_partner_id uuid;
  v_partner_gross numeric := 0;
  v_partner_commission numeric := 0;
  v_prior_partner_gross numeric := 0;
  v_prior_partner_commission numeric := 0;
  v_partner_gross_reversal numeric := 0;
  v_partner_commission_reversal numeric := 0;
  v_partner_net_reversal numeric := 0;
  v_refund_payment_id uuid := gen_random_uuid();
  v_correction_id uuid := gen_random_uuid();
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then
    raise exception 'Correction request key is required';
  end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.request_key = p_request_key
  ) then
    raise exception 'Correction request was already processed';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Correction reason must be at least 5 characters';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Correction reason must be 500 characters or fewer';
  end if;
  if v_type not in ('full_refund', 'partial_refund', 'duplicate', 'invalidated', 'cancelled_order') then
    raise exception 'Unsupported payment correction type';
  end if;
  if v_amount <= 0 then
    raise exception 'Correction amount must be greater than zero';
  end if;

  select payment.order_id, payment.amount_etb, payment.event,
         driver_order.driver_id, driver_order.status
  into v_order_id, v_source_amount, v_source_event, v_driver_id, v_order_status
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if v_source_event not in ('held_escrow', 'released') then
    raise exception 'Only held or released payments can be corrected';
  end if;
  if v_type = 'cancelled_order' and v_order_status <> 'cancelled' then
    raise exception 'Cancelled-order correction requires a cancelled order';
  end if;

  select coalesce(sum(correction.amount_etb), 0)
  into v_already_refunded
  from public.financial_corrections correction
  where correction.source_payment_id = p_payment_id;

  v_remaining := greatest(round(v_source_amount - v_already_refunded, 2), 0);
  if v_remaining <= 0 then
    raise exception 'Payment has already been fully corrected';
  end if;
  if v_amount > v_remaining then
    raise exception 'Correction exceeds remaining payment amount by ETB %', round(v_amount - v_remaining, 2);
  end if;
  if v_type = 'partial_refund' and v_amount >= v_remaining then
    raise exception 'Partial refund must be less than the remaining payment amount';
  end if;
  if v_type <> 'partial_refund' and v_amount <> v_remaining then
    raise exception 'This correction type must reverse the full remaining payment amount';
  end if;

  select coalesce(
    (
      select case when confirmation.commission_reversed_at is null
        then confirmation.commission_etb else 0 end
      from public.driver_payment_confirmations confirmation
      where confirmation.payment_id = p_payment_id
    ),
    (
      select case when charge.status = 'active' then charge.commission_etb else 0 end
      from public.driver_commission_charges charge
      where charge.payment_id = p_payment_id
    ),
    0
  )
  into v_original_driver_commission;

  select coalesce(sum(correction.driver_commission_reversal_etb), 0)
  into v_prior_driver_reversal
  from public.financial_corrections correction
  where correction.source_payment_id = p_payment_id;

  v_driver_reversal := case
    when v_amount = v_remaining then greatest(v_original_driver_commission - v_prior_driver_reversal, 0)
    else least(
      greatest(v_original_driver_commission - v_prior_driver_reversal, 0),
      round(v_original_driver_commission * v_amount / v_source_amount, 2)
    )
  end;

  select earning.id, earning.partner_id, earning.gross_etb, earning.hallo_commission_etb
  into v_earning_id, v_partner_id, v_partner_gross, v_partner_commission
  from public.partner_freight_earnings earning
  where earning.order_id = v_order_id
    and earning.status <> 'reversed'
  for update;

  if v_earning_id is not null then
    select
      coalesce(sum(correction.partner_gross_reversal_etb), 0),
      coalesce(sum(correction.partner_commission_reversal_etb), 0)
    into v_prior_partner_gross, v_prior_partner_commission
    from public.financial_corrections correction
    where correction.partner_earning_id = v_earning_id;

    v_partner_gross_reversal := least(
      v_amount,
      greatest(v_partner_gross - v_prior_partner_gross, 0)
    );
    v_partner_commission_reversal := case
      when v_partner_gross <= 0 then 0
      when v_partner_gross_reversal >= greatest(v_partner_gross - v_prior_partner_gross, 0)
        then greatest(v_partner_commission - v_prior_partner_commission, 0)
      else least(
        greatest(v_partner_commission - v_prior_partner_commission, 0),
        round(v_partner_commission * v_partner_gross_reversal / nullif(v_partner_gross, 0), 2)
      )
    end;
    v_partner_net_reversal := v_partner_gross_reversal - v_partner_commission_reversal;
  end if;

  insert into public.payments(
    id, order_id, provider, provider_ref, amount_etb, event, raw_payload,
    reviewed_by, reviewed_at
  ) values (
    v_refund_payment_id,
    v_order_id,
    'financial_correction',
    'CORR-' || upper(replace(p_request_key::text, '-', '')),
    v_amount,
    'refunded',
    jsonb_build_object(
      'correction_id', v_correction_id,
      'source_payment_id', p_payment_id,
      'correction_type', v_type,
      'reason', v_reason,
      'actor_id', v_actor
    ),
    v_actor,
    now()
  );

  insert into public.financial_corrections(
    id, request_key, correction_type, source_payment_id, refund_payment_id,
    partner_earning_id, order_id, driver_id, partner_id, amount_etb,
    driver_commission_reversal_etb, partner_gross_reversal_etb,
    partner_commission_reversal_etb, partner_net_reversal_etb,
    reason, actor_id
  ) values (
    v_correction_id, p_request_key, v_type, p_payment_id, v_refund_payment_id,
    v_earning_id, v_order_id, v_driver_id, v_partner_id, v_amount,
    v_driver_reversal, v_partner_gross_reversal,
    v_partner_commission_reversal, v_partner_net_reversal,
    v_reason, v_actor
  );

  if v_driver_id is not null and v_driver_reversal > 0 then
    insert into public.driver_commission_audit(driver_id, action, actor_id, details)
    values (
      v_driver_id,
      'commission_reversed',
      v_actor,
      jsonb_build_object(
        'correction_id', v_correction_id,
        'source_payment_id', p_payment_id,
        'refund_payment_id', v_refund_payment_id,
        'amount_etb', v_driver_reversal,
        'correction_type', v_type,
        'reason', v_reason
      )
    );
  end if;

  if v_partner_id is not null and v_partner_gross_reversal > 0 then
    insert into public.partner_activity_log(
      partner_id, actor_id, action, entity_type, entity_id, metadata
    ) values (
      v_partner_id,
      v_actor,
      'partner_freight_reversed',
      'financial_correction',
      v_correction_id::text,
      jsonb_build_object(
        'earning_id', v_earning_id,
        'source_payment_id', p_payment_id,
        'gross_reversal_etb', v_partner_gross_reversal,
        'hallo_commission_reversal_etb', v_partner_commission_reversal,
        'partner_net_reversal_etb', v_partner_net_reversal,
        'correction_type', v_type,
        'reason', v_reason
      )
    );
  end if;

  perform public.recompute_order_payment_status(v_order_id);
  return v_correction_id;
end;
$$;

revoke all on function public.admin_reverse_payment(uuid, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.admin_reverse_payment(uuid, numeric, text, text, uuid)
  to authenticated;

create or replace function public.admin_reverse_partner_settlement(
  p_settlement_id uuid,
  p_reason text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_partner_id uuid;
  v_amount numeric;
  v_status text;
  v_correction_id uuid := gen_random_uuid();
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then raise exception 'Correction request key is required'; end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Reversal reason must be at least 5 characters';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Reversal reason must be 500 characters or fewer';
  end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.request_key = p_request_key
  ) then
    raise exception 'Correction request was already processed';
  end if;

  select settlement.partner_id, settlement.amount_etb, settlement.status
  into v_partner_id, v_amount, v_status
  from public.partner_settlements settlement
  where settlement.id = p_settlement_id
  for update;

  if not found then raise exception 'Partner settlement not found'; end if;
  if v_status <> 'paid' then raise exception 'Only paid Partner settlements can be reversed'; end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.partner_settlement_id = p_settlement_id
  ) then
    raise exception 'Partner settlement was already reversed';
  end if;

  insert into public.financial_corrections(
    id, request_key, correction_type, partner_settlement_id,
    partner_id, amount_etb, reason, actor_id
  ) values (
    v_correction_id, p_request_key, 'reversed_settlement', p_settlement_id,
    v_partner_id, v_amount, v_reason, v_actor
  );

  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_partner_id,
    v_actor,
    'partner_settlement_reversed',
    'partner_settlement',
    p_settlement_id::text,
    jsonb_build_object(
      'correction_id', v_correction_id,
      'amount_etb', v_amount,
      'reason', v_reason
    )
  );

  return v_correction_id;
end;
$$;

revoke all on function public.admin_reverse_partner_settlement(uuid, text, uuid)
  from public, anon;
grant execute on function public.admin_reverse_partner_settlement(uuid, text, uuid)
  to authenticated;

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
  with earning_rows as (
    select
      earning.id,
      case when earning.status = 'reversed' then 0 else greatest(
        earning.gross_etb - coalesce(sum(correction.partner_gross_reversal_etb), 0), 0
      ) end as effective_gross,
      case when earning.status = 'reversed' then 0 else greatest(
        earning.hallo_commission_etb - coalesce(sum(correction.partner_commission_reversal_etb), 0), 0
      ) end as effective_commission,
      case when earning.status = 'reversed' then 0 else greatest(
        earning.partner_net_etb - coalesce(sum(correction.partner_net_reversal_etb), 0), 0
      ) end as effective_net
    from public.partner_freight_earnings earning
    left join public.financial_corrections correction
      on correction.partner_earning_id = earning.id
    where earning.partner_id = p_partner_id
    group by earning.id
  ), earning_totals as (
    select
      coalesce(sum(earning_rows.effective_gross), 0)::numeric as gross,
      coalesce(sum(earning_rows.effective_commission), 0)::numeric as commission,
      coalesce(sum(earning_rows.effective_net), 0)::numeric as net,
      count(*) filter (where earning_rows.effective_gross > 0)::bigint as freight_count
    from earning_rows
  ), settlement_rows as (
    select
      settlement.id,
      settlement.status,
      greatest(
        settlement.amount_etb - coalesce(sum(correction.amount_etb), 0), 0
      ) as effective_amount
    from public.partner_settlements settlement
    left join public.financial_corrections correction
      on correction.partner_settlement_id = settlement.id
    where settlement.partner_id = p_partner_id
    group by settlement.id
  ), settlement_totals as (
    select
      coalesce(sum(settlement_rows.effective_amount)
        filter (where settlement_rows.status = 'pending'), 0)::numeric as pending,
      coalesce(sum(settlement_rows.effective_amount)
        filter (where settlement_rows.status = 'paid'), 0)::numeric as paid
    from settlement_rows
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

create or replace function public.driver_financial_summary(p_driver_id uuid)
returns table(
  completed_trips bigint,
  gross_released_etb numeric,
  commission_charged_etb numeric,
  commission_paid_etb numeric,
  admin_deposit_etb numeric,
  available_deposit_etb numeric,
  commission_due_etb numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_leadership boolean := false;
begin
  if v_is_service then
    v_is_leadership := true;
  elsif v_uid is not null then
    select exists (
      select 1 from public.profiles profile
      where profile.id = v_uid and profile.role::text in ('admin', 'ceo')
    ) into v_is_leadership;
  end if;
  if v_uid is null and not v_is_service then raise exception 'Authentication required'; end if;
  if p_driver_id is distinct from v_uid and not v_is_leadership then
    raise exception 'You can only view your own financial summary';
  end if;

  return query
  with totals as (
    select
      (select count(*) from public.orders driver_order
        where driver_order.driver_id = p_driver_id
          and driver_order.status = 'delivered')::bigint as trips,
      greatest(coalesce((
        select sum(case
          when payment.event = 'released' then payment.amount_etb
          when payment.event = 'refunded' then -payment.amount_etb
          else 0 end)
        from public.payments payment
        join public.orders driver_order on driver_order.id = payment.order_id
        where driver_order.driver_id = p_driver_id
      ), 0), 0)::numeric as gross,
      private.driver_commission_charged_total(p_driver_id) as charged,
      coalesce((select sum(payment.amount_etb)
        from public.driver_commission_payments payment
        where payment.driver_id = p_driver_id and payment.status = 'approved'), 0)::numeric as paid,
      coalesce((select sum(deposit.amount_etb)
        from public.driver_commission_deposits deposit
        where deposit.driver_id = p_driver_id and deposit.status = 'active'), 0)::numeric as deposited
  ), reconciled as (
    select totals.*, greatest(0, totals.charged - totals.paid) as unpaid_commission
    from totals
  )
  select
    reconciled.trips,
    reconciled.gross,
    reconciled.charged,
    reconciled.paid,
    reconciled.deposited,
    greatest(0, reconciled.deposited - reconciled.unpaid_commission),
    greatest(0, reconciled.unpaid_commission - reconciled.deposited)
  from reconciled;
end;
$$;

revoke all on function public.driver_financial_summary(uuid) from public, anon;
grant execute on function public.driver_financial_summary(uuid) to authenticated, service_role;

create or replace function public.admin_platform_commission_accruals()
returns table(
  payment_id uuid,
  order_id uuid,
  tracking_id text,
  driver_id uuid,
  driver_name text,
  provider text,
  provider_ref text,
  gross_etb numeric,
  commission_percent numeric,
  commission_etb numeric,
  driver_net_etb numeric,
  confirmed_at timestamptz,
  released_at timestamptz,
  commission_accrued_at timestamptz,
  commission_reversed_at timestamptz,
  commission_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  return query
  with canonical as (
    select
      confirmation.payment_id,
      confirmation.order_id,
      confirmation.driver_id,
      confirmation.gross_etb,
      confirmation.commission_percent,
      confirmation.commission_etb,
      confirmation.driver_net_etb,
      confirmation.confirmed_at,
      confirmation.released_at,
      confirmation.commission_accrued_at,
      confirmation.commission_reversed_at,
      confirmation.commission_reversed_at is not null as legacy_reversed
    from public.driver_payment_confirmations confirmation

    union all

    select
      charge.payment_id,
      charge.order_id,
      charge.driver_id,
      charge.gross_etb,
      charge.commission_percent,
      charge.commission_etb,
      (charge.gross_etb - charge.commission_etb)::numeric,
      coalesce(payment.reviewed_at, charge.created_at),
      case when payment.event = 'released'
        then coalesce(payment.reviewed_at, charge.created_at) end,
      charge.created_at,
      case when charge.status = 'reversed' then charge.updated_at end,
      charge.status = 'reversed'
    from public.driver_commission_charges charge
    join public.payments payment on payment.id = charge.payment_id
    where not exists (
      select 1
      from public.driver_payment_confirmations confirmation
      where confirmation.payment_id = charge.payment_id
    )
  ), effective as (
    select
      canonical.*,
      coalesce(sum(correction.amount_etb), 0)::numeric as refund_etb,
      coalesce(sum(correction.driver_commission_reversal_etb), 0)::numeric
        as correction_commission_etb
    from canonical
    left join public.financial_corrections correction
      on correction.source_payment_id = canonical.payment_id
    group by
      canonical.payment_id, canonical.order_id, canonical.driver_id,
      canonical.gross_etb, canonical.commission_percent,
      canonical.commission_etb, canonical.driver_net_etb,
      canonical.confirmed_at, canonical.released_at,
      canonical.commission_accrued_at, canonical.commission_reversed_at,
      canonical.legacy_reversed
  )
  select
    effective.payment_id,
    effective.order_id,
    driver_order.tracking_id,
    effective.driver_id,
    profile.full_name,
    payment.provider,
    payment.provider_ref,
    case when effective.legacy_reversed then 0 else greatest(
      effective.gross_etb - effective.refund_etb, 0
    ) end::numeric,
    effective.commission_percent,
    case when effective.legacy_reversed then 0 else greatest(
      effective.commission_etb - effective.correction_commission_etb, 0
    ) end::numeric,
    case when effective.legacy_reversed then 0 else greatest(
      effective.driver_net_etb
        - greatest(effective.refund_etb - effective.correction_commission_etb, 0),
      0
    ) end::numeric,
    effective.confirmed_at,
    effective.released_at,
    effective.commission_accrued_at,
    case
      when effective.legacy_reversed then effective.commission_reversed_at
      when effective.refund_etb > 0 then (
        select max(correction.created_at)
        from public.financial_corrections correction
        where correction.source_payment_id = effective.payment_id
      )
      else null
    end,
    case
      when effective.legacy_reversed
        or effective.refund_etb >= effective.gross_etb then 'reversed'
      when effective.refund_etb > 0 then 'partially_reversed'
      when effective.released_at is not null then 'released'
      else 'accrued'
    end::text
  from effective
  join public.payments payment on payment.id = effective.payment_id
  join public.orders driver_order on driver_order.id = effective.order_id
  left join public.profiles profile on profile.id = effective.driver_id
  order by effective.confirmed_at desc;
end;
$$;

revoke all on function public.admin_platform_commission_accruals()
  from public, anon;
grant execute on function public.admin_platform_commission_accruals()
  to authenticated;

create or replace function public.admin_update_payment_event(
  p_payment_id uuid,
  p_event public.payment_event
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_current public.payment_event;
  v_amount numeric;
  v_provider text;
  v_driver_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_committed_excluding_current numeric;
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_event = 'refunded' then
    raise exception 'Use the auditable financial correction action for refunds';
  end if;

  select payment.order_id, payment.event, payment.amount_etb, payment.provider,
         driver_order.driver_id, coalesce(driver_order.price_etb, 0), driver_order.status
  into v_order_id, v_current, v_amount, v_provider,
       v_driver_id, v_order_total, v_order_status
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if not (
    (v_current = 'initiated' and p_event in ('held_escrow', 'failed'))
    or (v_current = 'held_escrow' and p_event = 'released')
    or v_current = p_event
  ) then
    raise exception 'Invalid payment transition: % to %', v_current, p_event;
  end if;

  if p_event in ('held_escrow', 'released') and v_current is distinct from p_event then
    if p_event = 'released' and v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;
    if p_event = 'released'
      and lower(btrim(coalesce(v_provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash')
      and not exists (
        select 1 from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = p_payment_id
          and confirmation.order_id = v_order_id
          and confirmation.driver_id = v_driver_id
      ) then
      raise exception 'Assigned driver confirmation is required before releasing this payment';
    end if;

    select coalesce(sum(case
      when payment.event in ('held_escrow', 'released') then payment.amount_etb
      when payment.event = 'refunded' then -payment.amount_etb
      else 0 end), 0)
    into v_committed_excluding_current
    from public.payments payment
    where payment.order_id = v_order_id and payment.id <> p_payment_id;

    if v_committed_excluding_current + v_amount > v_order_total + 0.005 then
      raise exception 'Payment transition exceeds invoice total by ETB %',
        round(v_committed_excluding_current + v_amount - v_order_total, 2);
    end if;
  end if;

  update public.payments set event = p_event where id = p_payment_id;
  if p_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
  end if;
  perform public.recompute_order_payment_status(v_order_id);
end;
$$;

revoke all on function public.admin_update_payment_event(uuid, public.payment_event)
  from public, anon;
grant execute on function public.admin_update_payment_event(uuid, public.payment_event)
  to authenticated;

-- The legacy credit-refund RPC has no reason or idempotency key and therefore
-- cannot satisfy immutable correction requirements. Keep it unavailable while
-- callers migrate to admin_reverse_payment.
revoke all on function public.admin_refund_order_credit(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
