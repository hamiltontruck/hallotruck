-- Phase 3: audited Partner settlement lifecycle and partial-payment ledger.
-- Existing freight earnings and financial corrections remain immutable.

create sequence if not exists public.partner_settlement_reference_seq;

alter table public.partner_freight_earnings
  add column if not exists project_id uuid;

alter table public.partner_settlements
  add column if not exists settlement_reference text,
  add column if not exists request_key uuid,
  add column if not exists project_id uuid,
  add column if not exists approval_notes text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_at timestamptz;

update public.partner_settlements settlement
set
  settlement_reference = coalesce(
    settlement.settlement_reference,
    'HPS-' || to_char(settlement.created_at, 'YYYY') || '-'
      || upper(substr(replace(settlement.id::text, '-', ''), 1, 8))
  ),
  request_key = coalesce(settlement.request_key, settlement.id)
where settlement.settlement_reference is null
   or settlement.request_key is null;

alter table public.partner_settlements
  alter column settlement_reference set not null,
  alter column request_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_freight_earnings_project_id_fkey'
      and conrelid = 'public.partner_freight_earnings'::regclass
  ) then
    alter table public.partner_freight_earnings
      add constraint partner_freight_earnings_project_id_fkey
      foreign key (project_id) references public.partner_projects(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_settlements_project_id_fkey'
      and conrelid = 'public.partner_settlements'::regclass
  ) then
    alter table public.partner_settlements
      add constraint partner_settlements_project_id_fkey
      foreign key (project_id) references public.partner_projects(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_settlements_reviewed_by_fkey'
      and conrelid = 'public.partner_settlements'::regclass
  ) then
    alter table public.partner_settlements
      add constraint partner_settlements_reviewed_by_fkey
      foreign key (reviewed_by) references public.profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_settlements_rejected_by_fkey'
      and conrelid = 'public.partner_settlements'::regclass
  ) then
    alter table public.partner_settlements
      add constraint partner_settlements_rejected_by_fkey
      foreign key (rejected_by) references public.profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_settlements_id_partner_key'
      and conrelid = 'public.partner_settlements'::regclass
  ) then
    alter table public.partner_settlements
      add constraint partner_settlements_id_partner_key unique (id, partner_id);
  end if;
end $$;

alter table public.partner_settlements
  drop constraint if exists partner_settlements_status_check;

alter table public.partner_settlements
  add constraint partner_settlements_status_check check (status in (
    'pending', 'under_review', 'approved', 'partially_paid',
    'paid', 'rejected', 'reversed'
  )),
  add constraint partner_settlements_reference_not_blank check (
    char_length(btrim(settlement_reference)) between 8 and 64
  ),
  add constraint partner_settlements_approval_notes_length check (
    approval_notes is null or char_length(btrim(approval_notes)) between 2 and 1000
  ),
  add constraint partner_settlements_rejection_reason_length check (
    rejection_reason is null or char_length(btrim(rejection_reason)) between 5 and 500
  );

create unique index if not exists partner_settlements_reference_key
  on public.partner_settlements(lower(settlement_reference));
create unique index if not exists partner_settlements_request_key
  on public.partner_settlements(request_key);
create index if not exists partner_earnings_partner_project_created_idx
  on public.partner_freight_earnings(partner_id, project_id, accrued_at desc)
  where project_id is not null;
create index if not exists partner_settlements_partner_project_created_idx
  on public.partner_settlements(partner_id, project_id, created_at desc)
  where project_id is not null;
create index if not exists partner_settlements_reviewed_by_idx
  on public.partner_settlements(reviewed_by)
  where reviewed_by is not null;
create index if not exists partner_settlements_rejected_by_idx
  on public.partner_settlements(rejected_by)
  where rejected_by is not null;

create table public.partner_settlement_payments (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  settlement_id uuid not null,
  partner_id uuid not null,
  amount_etb numeric(14,2) not null check (amount_etb > 0),
  payment_method text not null check (payment_method in (
    'bank_transfer', 'mobile_money', 'cash', 'cheque', 'other'
  )),
  provider text,
  transaction_ref text not null check (
    char_length(btrim(transaction_ref)) between 3 and 160
  ),
  paid_at timestamptz not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint partner_settlement_payments_settlement_partner_fkey
    foreign key (settlement_id, partner_id)
    references public.partner_settlements(id, partner_id) on delete restrict,
  check (provider is null or char_length(btrim(provider)) between 2 and 120)
);

create unique index partner_settlement_payments_transaction_key
  on public.partner_settlement_payments(
    lower(payment_method), lower(coalesce(provider, '')), lower(btrim(transaction_ref))
  );
create index partner_settlement_payments_partner_paid_idx
  on public.partner_settlement_payments(partner_id, paid_at desc);
create index partner_settlement_payments_settlement_paid_idx
  on public.partner_settlement_payments(settlement_id, paid_at desc);
create index partner_settlement_payments_recorded_by_idx
  on public.partner_settlement_payments(recorded_by, created_at desc);

create table public.partner_settlement_events (
  id bigint generated always as identity primary key,
  settlement_id uuid not null,
  partner_id uuid not null,
  event_type text not null check (event_type in (
    'created', 'under_review', 'approved', 'rejected',
    'payment_recorded', 'partially_paid', 'paid', 'reversed'
  )),
  from_status text,
  to_status text not null,
  amount_etb numeric(14,2) check (amount_etb is null or amount_etb > 0),
  reason text check (reason is null or char_length(btrim(reason)) between 2 and 1000),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint partner_settlement_events_settlement_partner_fkey
    foreign key (settlement_id, partner_id)
    references public.partner_settlements(id, partner_id) on delete restrict
);

create index partner_settlement_events_partner_created_idx
  on public.partner_settlement_events(partner_id, created_at desc);
create index partner_settlement_events_settlement_created_idx
  on public.partner_settlement_events(settlement_id, created_at desc);
create index partner_settlement_events_actor_idx
  on public.partner_settlement_events(actor_id, created_at desc);

insert into public.partner_settlement_events(
  settlement_id, partner_id, event_type, from_status, to_status,
  amount_etb, reason, actor_id, metadata, created_at
)
select
  settlement.id,
  settlement.partner_id,
  'created',
  null,
  settlement.status,
  settlement.amount_etb,
  settlement.note,
  settlement.created_by,
  jsonb_build_object('legacy_snapshot', true),
  settlement.created_at
from public.partner_settlements settlement;

alter table public.partner_settlement_payments enable row level security;
alter table public.partner_settlement_events enable row level security;

create policy partner_settlement_payments_authorized_read
on public.partner_settlement_payments
for select
to authenticated
using ((select public.can_view_partner_finance(partner_id)));

create policy partner_settlement_events_authorized_read
on public.partner_settlement_events
for select
to authenticated
using ((select public.can_view_partner_finance(partner_id)));

revoke all on table public.partner_settlements from public, anon, authenticated;
grant select on table public.partner_settlements to authenticated;

revoke all on table public.partner_settlement_payments from public, anon, authenticated;
grant select on table public.partner_settlement_payments to authenticated;

revoke all on table public.partner_settlement_events from public, anon, authenticated;
grant select on table public.partner_settlement_events to authenticated;

revoke all on sequence public.partner_settlement_reference_seq
  from public, anon, authenticated;
revoke all on sequence public.partner_settlement_events_id_seq
  from public, anon, authenticated;

create trigger partner_settlement_payments_immutable
before update or delete on public.partner_settlement_payments
for each row execute function private.reject_financial_history_mutation();

create trigger partner_settlement_events_immutable
before update or delete on public.partner_settlement_events
for each row execute function private.reject_financial_history_mutation();

create or replace function private.next_partner_settlement_reference()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'HPS-' || to_char(current_date, 'YYYY') || '-'
    || lpad(nextval('public.partner_settlement_reference_seq')::text, 6, '0');
$$;

revoke all on function private.next_partner_settlement_reference()
  from public, anon, authenticated;

create or replace function private.record_partner_settlement_event(
  p_settlement_id uuid,
  p_partner_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_amount_etb numeric,
  p_reason text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.partner_settlement_events(
    settlement_id, partner_id, event_type, from_status, to_status,
    amount_etb, reason, actor_id, metadata
  ) values (
    p_settlement_id, p_partner_id, p_event_type, p_from_status, p_to_status,
    p_amount_etb, nullif(btrim(coalesce(p_reason, '')), ''), p_actor_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.record_partner_settlement_event(
  uuid, uuid, text, text, text, numeric, text, uuid, jsonb
) from public, anon, authenticated;

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
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
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
  if not found then raise exception 'No active Partner commission rule'; end if;

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

create or replace function public.admin_record_partner_freight(
  p_partner_id uuid,
  p_order_id uuid,
  p_vehicle_id uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_partner_freight_internal(
    p_partner_id, p_order_id, p_vehicle_id, null
  );
$$;

create or replace function public.admin_record_partner_freight(
  p_partner_id uuid,
  p_order_id uuid,
  p_vehicle_id uuid,
  p_project_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_partner_freight_internal(
    p_partner_id, p_order_id, p_vehicle_id, p_project_id
  );
$$;

revoke all on function public.admin_record_partner_freight(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.admin_record_partner_freight(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.admin_record_partner_freight(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.admin_record_partner_freight(uuid, uuid, uuid, uuid)
  to authenticated;

create or replace function public.admin_create_partner_settlement_request(
  p_partner_id uuid,
  p_amount_etb numeric,
  p_project_id uuid,
  p_note text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_summary record;
  v_settlement_id uuid;
  v_reference text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then raise exception 'Settlement request key is required'; end if;
  if p_amount_etb is null or p_amount_etb <= 0 then
    raise exception 'Settlement amount must be positive';
  end if;
  if v_note is not null and char_length(v_note) not between 2 and 1000 then
    raise exception 'Settlement note must be between 2 and 1000 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_key::text, 0)
  );

  select settlement.id into v_settlement_id
  from public.partner_settlements settlement
  where settlement.request_key = p_request_key;
  if found then return v_settlement_id; end if;

  perform 1
  from public.partner_organizations organization
  where organization.id = p_partner_id and organization.status = 'active'
  for update;
  if not found then raise exception 'Active Partner organization not found'; end if;

  if p_project_id is not null and not exists (
    select 1 from public.partner_projects project
    where project.id = p_project_id and project.partner_id = p_partner_id
  ) then raise exception 'Project does not belong to Partner organization'; end if;

  select * into v_summary from public.partner_wallet_summary(p_partner_id);
  if round(p_amount_etb, 2) > round(v_summary.payable_etb, 2) then
    raise exception 'Settlement exceeds Partner payable balance';
  end if;

  v_reference := private.next_partner_settlement_reference();
  insert into public.partner_settlements(
    partner_id, project_id, settlement_reference, request_key,
    amount_etb, status, note, created_by
  ) values (
    p_partner_id, p_project_id, v_reference, p_request_key,
    round(p_amount_etb, 2), 'pending', v_note, v_actor
  ) returning id into v_settlement_id;

  perform private.record_partner_settlement_event(
    v_settlement_id, p_partner_id, 'created', null, 'pending',
    round(p_amount_etb, 2), v_note, v_actor,
    jsonb_build_object('settlement_reference', v_reference, 'project_id', p_project_id)
  );
  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_partner_id, v_actor, 'partner_settlement_created',
    'partner_settlement', v_settlement_id::text,
    jsonb_build_object(
      'settlement_reference', v_reference,
      'amount_etb', round(p_amount_etb, 2),
      'project_id', p_project_id
    )
  );
  return v_settlement_id;
end;
$$;

revoke all on function public.admin_create_partner_settlement_request(
  uuid, numeric, uuid, text, uuid
) from public, anon;
grant execute on function public.admin_create_partner_settlement_request(
  uuid, numeric, uuid, text, uuid
) to authenticated;

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
begin
  return public.admin_create_partner_settlement_request(
    p_partner_id,
    p_amount_etb,
    null,
    concat_ws(
      ' · ',
      nullif(btrim(coalesce(p_note, '')), ''),
      case when nullif(btrim(coalesce(p_provider, '')), '') is not null
        then 'Legacy provider: ' || btrim(p_provider) end,
      case when nullif(btrim(coalesce(p_transaction_ref, '')), '') is not null
        then 'Legacy reference: ' || btrim(p_transaction_ref) end
    ),
    gen_random_uuid()
  );
end;
$$;

revoke all on function public.admin_create_partner_settlement(
  uuid, numeric, text, text, text
) from public, anon;
grant execute on function public.admin_create_partner_settlement(
  uuid, numeric, text, text, text
) to authenticated;

create or replace function public.admin_transition_partner_settlement(
  p_settlement_id uuid,
  p_action text,
  p_notes text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_settlement public.partner_settlements%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_next_status text;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if v_notes is not null and char_length(v_notes) not between 2 and 1000 then
    raise exception 'Settlement notes must be between 2 and 1000 characters';
  end if;

  select * into v_settlement
  from public.partner_settlements settlement
  where settlement.id = p_settlement_id
  for update;
  if not found then raise exception 'Partner settlement not found'; end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.partner_settlement_id = p_settlement_id
  ) then raise exception 'Reversed Partner settlement cannot transition'; end if;

  if v_action = 'submit_review' then
    if v_settlement.status <> 'pending' then
      raise exception 'Only pending settlements can enter review';
    end if;
    v_next_status := 'under_review';
    update public.partner_settlements
    set status = v_next_status, reviewed_by = v_actor, reviewed_at = now(),
        updated_at = now()
    where id = p_settlement_id;
  elsif v_action = 'approve' then
    if v_settlement.status <> 'under_review' then
      raise exception 'Only settlements under review can be approved';
    end if;
    v_next_status := 'approved';
    update public.partner_settlements
    set status = v_next_status, approved_by = v_actor, approved_at = now(),
        approval_notes = v_notes, updated_at = now()
    where id = p_settlement_id;
  elsif v_action = 'reject' then
    if v_settlement.status not in ('pending', 'under_review') then
      raise exception 'Only pending or under-review settlements can be rejected';
    end if;
    if v_notes is null or char_length(v_notes) < 5 then
      raise exception 'Rejection reason must be at least 5 characters';
    end if;
    if char_length(v_notes) > 500 then
      raise exception 'Rejection reason must be 500 characters or fewer';
    end if;
    v_next_status := 'rejected';
    update public.partner_settlements
    set status = v_next_status, rejection_reason = v_notes,
        rejected_by = v_actor, rejected_at = now(), updated_at = now()
    where id = p_settlement_id;
  else
    raise exception 'Unsupported Partner settlement action';
  end if;

  perform private.record_partner_settlement_event(
    p_settlement_id, v_settlement.partner_id, v_next_status,
    v_settlement.status, v_next_status, null, v_notes, v_actor,
    jsonb_build_object('action', v_action)
  );
  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_settlement.partner_id, v_actor,
    'partner_settlement_' || v_next_status,
    'partner_settlement', p_settlement_id::text,
    jsonb_build_object(
      'settlement_reference', v_settlement.settlement_reference,
      'previous_status', v_settlement.status,
      'new_status', v_next_status,
      'notes', v_notes
    )
  );
  return v_next_status;
end;
$$;

revoke all on function public.admin_transition_partner_settlement(uuid, text, text)
  from public, anon;
grant execute on function public.admin_transition_partner_settlement(uuid, text, text)
  to authenticated;

create or replace function public.admin_record_partner_settlement_payment(
  p_settlement_id uuid,
  p_amount_etb numeric,
  p_payment_method text,
  p_provider text,
  p_transaction_ref text,
  p_paid_at timestamptz,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_settlement public.partner_settlements%rowtype;
  v_payment_id uuid;
  v_method text := lower(btrim(coalesce(p_payment_method, '')));
  v_provider text := nullif(btrim(coalesce(p_provider, '')), '');
  v_transaction_ref text := nullif(btrim(coalesce(p_transaction_ref, '')), '');
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_paid_total numeric;
  v_remaining numeric;
  v_new_status text;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then raise exception 'Payment request key is required'; end if;
  if p_amount_etb is null or p_amount_etb <= 0 then
    raise exception 'Settlement payment amount must be positive';
  end if;
  if v_method not in ('bank_transfer', 'mobile_money', 'cash', 'cheque', 'other') then
    raise exception 'Unsupported settlement payment method';
  end if;
  if v_transaction_ref is null or char_length(v_transaction_ref) < 3 then
    raise exception 'Transaction reference must be at least 3 characters';
  end if;
  if char_length(v_transaction_ref) > 160 then
    raise exception 'Transaction reference must be 160 characters or fewer';
  end if;
  if v_provider is not null and char_length(v_provider) > 120 then
    raise exception 'Payment provider must be 120 characters or fewer';
  end if;
  if v_paid_at > now() + interval '5 minutes' then
    raise exception 'Settlement payment time cannot be in the future';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_key::text, 0)
  );

  select payment.id into v_payment_id
  from public.partner_settlement_payments payment
  where payment.request_key = p_request_key;
  if found then return v_payment_id; end if;

  select * into v_settlement
  from public.partner_settlements settlement
  where settlement.id = p_settlement_id
  for update;
  if not found then raise exception 'Partner settlement not found'; end if;
  if v_settlement.status not in ('approved', 'partially_paid') then
    raise exception 'Only approved or partially paid settlements can receive payment';
  end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.partner_settlement_id = p_settlement_id
  ) then raise exception 'Reversed Partner settlement cannot receive payment'; end if;

  select coalesce(sum(payment.amount_etb), 0)
  into v_paid_total
  from public.partner_settlement_payments payment
  where payment.settlement_id = p_settlement_id;
  v_remaining := round(v_settlement.amount_etb - v_paid_total, 2);
  if round(p_amount_etb, 2) > v_remaining then
    raise exception 'Settlement payment exceeds outstanding amount';
  end if;

  insert into public.partner_settlement_payments(
    request_key, settlement_id, partner_id, amount_etb,
    payment_method, provider, transaction_ref, paid_at, recorded_by
  ) values (
    p_request_key, p_settlement_id, v_settlement.partner_id,
    round(p_amount_etb, 2), v_method, v_provider,
    v_transaction_ref, v_paid_at, v_actor
  ) returning id into v_payment_id;

  v_paid_total := round(v_paid_total + p_amount_etb, 2);
  v_new_status := case
    when v_paid_total = round(v_settlement.amount_etb, 2) then 'paid'
    else 'partially_paid'
  end;
  update public.partner_settlements
  set status = v_new_status,
      provider = v_provider,
      transaction_ref = v_transaction_ref,
      paid_at = case when v_new_status = 'paid' then v_paid_at else null end,
      updated_at = now()
  where id = p_settlement_id;

  perform private.record_partner_settlement_event(
    p_settlement_id, v_settlement.partner_id,
    case when v_new_status = 'paid' then 'paid' else 'partially_paid' end,
    v_settlement.status, v_new_status, round(p_amount_etb, 2),
    null, v_actor,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_method', v_method,
      'provider', v_provider,
      'transaction_ref', v_transaction_ref,
      'paid_total_etb', v_paid_total
    )
  );
  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_settlement.partner_id, v_actor,
    'partner_settlement_' || v_new_status,
    'partner_settlement', p_settlement_id::text,
    jsonb_build_object(
      'settlement_reference', v_settlement.settlement_reference,
      'payment_id', v_payment_id,
      'amount_etb', round(p_amount_etb, 2),
      'payment_method', v_method,
      'provider', v_provider,
      'transaction_ref', v_transaction_ref,
      'paid_total_etb', v_paid_total
    )
  );
  return v_payment_id;
exception
  when unique_violation then
    raise exception 'Settlement payment transaction was already recorded';
end;
$$;

revoke all on function public.admin_record_partner_settlement_payment(
  uuid, numeric, text, text, text, timestamptz, uuid
) from public, anon;
grant execute on function public.admin_record_partner_settlement_payment(
  uuid, numeric, text, text, text, timestamptz, uuid
) to authenticated;

create or replace function public.admin_mark_partner_settlement_paid(
  p_settlement_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use the audited partial-payment settlement action';
end;
$$;

revoke all on function public.admin_mark_partner_settlement_paid(uuid)
  from public, anon, authenticated;

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
  v_settlement public.partner_settlements%rowtype;
  v_existing_correction_id uuid;
  v_correction_id uuid;
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

  select correction.id into v_existing_correction_id
  from public.financial_corrections correction
  where correction.request_key = p_request_key;
  if found then return v_existing_correction_id; end if;

  select * into v_settlement
  from public.partner_settlements settlement
  where settlement.id = p_settlement_id
  for update;
  if not found then raise exception 'Partner settlement not found'; end if;
  if v_settlement.status <> 'paid' then
    raise exception 'Only paid Partner settlements can be reversed';
  end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.partner_settlement_id = p_settlement_id
  ) then raise exception 'Partner settlement was already reversed'; end if;

  v_correction_id := gen_random_uuid();
  insert into public.financial_corrections(
    id, request_key, correction_type, partner_settlement_id,
    partner_id, amount_etb, reason, actor_id
  ) values (
    v_correction_id, p_request_key, 'reversed_settlement', p_settlement_id,
    v_settlement.partner_id, v_settlement.amount_etb, v_reason, v_actor
  );

  perform private.record_partner_settlement_event(
    p_settlement_id, v_settlement.partner_id, 'reversed',
    v_settlement.status, 'reversed', v_settlement.amount_etb,
    v_reason, v_actor, jsonb_build_object('correction_id', v_correction_id)
  );
  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_settlement.partner_id, v_actor, 'partner_settlement_reversed',
    'partner_settlement', p_settlement_id::text,
    jsonb_build_object(
      'correction_id', v_correction_id,
      'settlement_reference', v_settlement.settlement_reference,
      'amount_etb', v_settlement.amount_etb,
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
        earning.hallo_commission_etb
          - coalesce(sum(correction.partner_commission_reversal_etb), 0), 0
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
      coalesce(sum(row.effective_gross), 0)::numeric as gross,
      coalesce(sum(row.effective_commission), 0)::numeric as commission,
      coalesce(sum(row.effective_net), 0)::numeric as net,
      count(*) filter (where row.effective_gross > 0)::bigint as freight_count
    from earning_rows row
  ), settlement_rows as (
    select
      settlement.id,
      settlement.status,
      settlement.amount_etb,
      case
        when exists (
          select 1 from public.partner_settlement_payments payment
          where payment.settlement_id = settlement.id
        ) then coalesce((
          select sum(payment.amount_etb)
          from public.partner_settlement_payments payment
          where payment.settlement_id = settlement.id
        ), 0)
        when settlement.status = 'paid' then settlement.amount_etb
        else 0
      end as recorded_paid,
      coalesce((
        select sum(correction.amount_etb)
        from public.financial_corrections correction
        where correction.partner_settlement_id = settlement.id
      ), 0) as reversed_paid
    from public.partner_settlements settlement
    where settlement.partner_id = p_partner_id
  ), settlement_effective as (
    select
      row.id,
      row.status,
      greatest(row.recorded_paid - row.reversed_paid, 0)::numeric as paid,
      case
        when row.status in ('pending', 'under_review', 'approved', 'partially_paid')
          then greatest(row.amount_etb - row.recorded_paid, 0)
        else 0
      end::numeric as pending
    from settlement_rows row
  ), settlement_totals as (
    select
      coalesce(sum(row.pending), 0)::numeric as pending,
      coalesce(sum(row.paid), 0)::numeric as paid
    from settlement_effective row
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
    greatest(
      earning_totals.net - settlement_totals.paid - settlement_totals.pending, 0
    ),
    fleet_totals.total,
    fleet_totals.available,
    earning_totals.freight_count
  from earning_totals, settlement_totals, fleet_totals;
end;
$$;

revoke all on function public.partner_wallet_summary(uuid) from public, anon;
grant execute on function public.partner_wallet_summary(uuid) to authenticated;

comment on table public.partner_settlement_payments is
  'Immutable partial-payment ledger for approved Partner settlements.';
comment on table public.partner_settlement_events is
  'Immutable Partner-visible audit trail for every settlement state transition.';
comment on function public.admin_record_partner_settlement_payment(
  uuid, numeric, text, text, text, timestamptz, uuid
) is 'Admin/CEO-only idempotent partial settlement payment action.';

notify pgrst, 'reload schema';
