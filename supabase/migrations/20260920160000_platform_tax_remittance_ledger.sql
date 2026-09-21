-- HALLO Admin government-tax remittance ledger.
-- The 15% rate is an application-configured rule supplied by HALLO leadership.
-- This migration does not represent an independent determination of tax law.
-- Tax liability is derived from canonical HALLO Driver commission; Driver 98%
-- payout rules are unchanged.
begin;

create table public.platform_tax_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  tax_rate_percent numeric(5,2) not null default 15.00
    check (tax_rate_percent = 15.00),
  commission_base_snapshot_etb numeric(14,2) not null
    check (commission_base_snapshot_etb > 0),
  tax_due_snapshot_etb numeric(14,2) not null
    check (tax_due_snapshot_etb > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (period_start, period_end)
);

create table public.platform_tax_remittances (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  tax_period_id uuid not null references public.platform_tax_periods(id) on delete restrict,
  amount_etb numeric(14,2) not null check (amount_etb > 0),
  payment_date date not null,
  payment_method text not null
    check (char_length(btrim(payment_method)) between 2 and 50),
  reference text not null
    check (char_length(btrim(reference)) between 3 and 120),
  receipt_path text not null unique
    check (char_length(btrim(receipt_path)) between 5 and 500),
  note text check (note is null or char_length(btrim(note)) between 3 and 500),
  paid_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index platform_tax_remittances_reference_unique
  on public.platform_tax_remittances (lower(btrim(reference)));
create index platform_tax_remittances_period_date_idx
  on public.platform_tax_remittances (tax_period_id, payment_date desc, created_at desc);

create table public.platform_tax_audit (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('period_created', 'remittance_recorded')),
  tax_period_id uuid not null references public.platform_tax_periods(id) on delete restrict,
  remittance_id uuid references public.platform_tax_remittances(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (event_type = 'period_created' and remittance_id is null)
    or (event_type = 'remittance_recorded' and remittance_id is not null)
  )
);

create index platform_tax_audit_period_created_idx
  on public.platform_tax_audit (tax_period_id, created_at desc);

alter table public.platform_tax_periods enable row level security;
alter table public.platform_tax_remittances enable row level security;
alter table public.platform_tax_audit enable row level security;

revoke all on table public.platform_tax_periods from anon;
revoke all on table public.platform_tax_remittances from anon;
revoke all on table public.platform_tax_audit from anon;
revoke insert, update, delete on table public.platform_tax_periods from authenticated;
revoke insert, update, delete on table public.platform_tax_remittances from authenticated;
revoke insert, update, delete on table public.platform_tax_audit from authenticated;
grant select on table public.platform_tax_periods to authenticated;
grant select on table public.platform_tax_remittances to authenticated;
grant select on table public.platform_tax_audit to authenticated;

create policy platform_tax_periods_leadership_read
  on public.platform_tax_periods
  for select to authenticated
  using ((select private.is_admin_or_ceo()));

create policy platform_tax_remittances_leadership_read
  on public.platform_tax_remittances
  for select to authenticated
  using ((select private.is_admin_or_ceo()));

create policy platform_tax_audit_leadership_read
  on public.platform_tax_audit
  for select to authenticated
  using ((select private.is_admin_or_ceo()));

create or replace function private.reject_platform_tax_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Platform tax history is immutable; append a new remittance instead';
end;
$$;

revoke all on function private.reject_platform_tax_history_mutation()
  from public, anon, authenticated;

create trigger platform_tax_periods_immutable
before update or delete on public.platform_tax_periods
for each row execute function private.reject_platform_tax_history_mutation();

create trigger platform_tax_remittances_immutable
before update or delete on public.platform_tax_remittances
for each row execute function private.reject_platform_tax_history_mutation();

create trigger platform_tax_audit_immutable
before update or delete on public.platform_tax_audit
for each row execute function private.reject_platform_tax_history_mutation();

create or replace function private.platform_commission_for_period(
  p_start date,
  p_end date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with canonical_source as (
    select
      confirmation.payment_id,
      case when confirmation.commission_reversed_at is null
        then round(confirmation.commission_etb, 2)
        else 0
      end::numeric as amount,
      confirmation.commission_accrued_at as event_at
    from public.driver_payment_confirmations confirmation

    union all

    select
      charge.payment_id,
      case when charge.status = 'active'
        then round(charge.commission_etb, 2)
        else 0
      end::numeric as amount,
      charge.created_at as event_at
    from public.driver_commission_charges charge
    where not exists (
      select 1
      from public.driver_payment_confirmations confirmation
      where confirmation.payment_id = charge.payment_id
    )
  ),
  correction_base as (
    select
      correction.source_payment_id as payment_id,
      sum(coalesce(correction.driver_commission_reversal_etb, 0))::numeric as reversal
    from public.financial_corrections correction
    where correction.source_payment_id is not null
    group by correction.source_payment_id
  ),
  corrected as (
    select
      source.payment_id,
      greatest(source.amount - coalesce(correction.reversal, 0), 0)::numeric as effective_commission
    from canonical_source source
    left join correction_base correction on correction.payment_id = source.payment_id
    where timezone('Africa/Addis_Ababa', source.event_at)::date between p_start and p_end
  ),
  unpaid_trip_commission as (
    select coalesce(sum(result.commission_etb), 0)::numeric as amount
    from public.driver_trip_payment_results result
    where result.result_type = 'payment_not_received'
      and timezone('Africa/Addis_Ababa', result.completed_at)::date between p_start and p_end
      and not exists (
        select 1
        from public.driver_trip_payment_results positive_result
        where positive_result.order_id = result.order_id
          and positive_result.result_type in ('cash_received', 'bank_telebirr')
      )
  )
  select round(
    coalesce((select sum(effective_commission) from corrected), 0)
    + (select amount from unpaid_trip_commission),
    2
  )::numeric;
$$;

revoke all on function private.platform_commission_for_period(date, date)
  from public, anon, authenticated;

create or replace function private.audit_platform_tax_period_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_tax_audit (
    event_type, tax_period_id, actor_id, details
  ) values (
    'period_created',
    new.id,
    new.created_by,
    jsonb_build_object(
      'period_start', new.period_start,
      'period_end', new.period_end,
      'tax_rate_percent', new.tax_rate_percent,
      'commission_base_snapshot_etb', new.commission_base_snapshot_etb,
      'tax_due_snapshot_etb', new.tax_due_snapshot_etb
    )
  );
  return new;
end;
$$;

revoke all on function private.audit_platform_tax_period_insert()
  from public, anon, authenticated;

create trigger platform_tax_period_audit_insert
after insert on public.platform_tax_periods
for each row execute function private.audit_platform_tax_period_insert();

create or replace function private.audit_platform_tax_remittance_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_tax_audit (
    event_type, tax_period_id, remittance_id, actor_id, details
  ) values (
    'remittance_recorded',
    new.tax_period_id,
    new.id,
    new.paid_by,
    jsonb_build_object(
      'amount_etb', new.amount_etb,
      'payment_date', new.payment_date,
      'payment_method', new.payment_method,
      'reference', new.reference,
      'receipt_path', new.receipt_path
    )
  );
  return new;
end;
$$;

revoke all on function private.audit_platform_tax_remittance_insert()
  from public, anon, authenticated;

create trigger platform_tax_remittance_audit_insert
after insert on public.platform_tax_remittances
for each row execute function private.audit_platform_tax_remittance_insert();

create or replace function public.admin_create_platform_tax_period(
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_today date := timezone('Africa/Addis_Ababa', now())::date;
  v_base numeric;
  v_due numeric;
  v_id uuid;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_period_start is null or p_period_end is null then
    raise exception 'Tax period start and end dates are required';
  end if;
  if p_period_end < p_period_start then
    raise exception 'Tax period end date cannot be before the start date';
  end if;
  if p_period_end > v_today then
    raise exception 'Tax period cannot end in the future';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform_tax_periods'));
  if exists (
    select 1
    from public.platform_tax_periods period
    where daterange(period.period_start, period.period_end, '[]')
      && daterange(p_period_start, p_period_end, '[]')
  ) then
    raise exception 'Tax period overlaps an existing recorded period';
  end if;

  v_base := private.platform_commission_for_period(p_period_start, p_period_end);
  if coalesce(v_base, 0) <= 0 then
    raise exception 'No canonical HALLO commission exists in this period';
  end if;
  v_due := round(v_base * 0.15, 2);

  insert into public.platform_tax_periods (
    period_start, period_end, tax_rate_percent,
    commission_base_snapshot_etb, tax_due_snapshot_etb, created_by
  ) values (
    p_period_start, p_period_end, 15.00,
    v_base, v_due, v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_create_platform_tax_period(date, date)
  from public, anon;
grant execute on function public.admin_create_platform_tax_period(date, date)
  to authenticated;

create or replace function public.admin_record_platform_tax_remittance(
  p_tax_period_id uuid,
  p_amount_etb numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_receipt_path text,
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
  v_period public.platform_tax_periods%rowtype;
  v_existing uuid;
  v_amount numeric := round(coalesce(p_amount_etb, 0), 2);
  v_paid numeric := 0;
  v_current_base numeric := 0;
  v_current_due numeric := 0;
  v_outstanding numeric := 0;
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_receipt_path text := nullif(btrim(coalesce(p_receipt_path, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_today date := timezone('Africa/Addis_Ababa', now())::date;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then
    raise exception 'Remittance request key is required';
  end if;

  select remittance.id
  into v_existing
  from public.platform_tax_remittances remittance
  where remittance.request_key = p_request_key;
  if found then
    return v_existing;
  end if;

  select *
  into v_period
  from public.platform_tax_periods period
  where period.id = p_tax_period_id
  for update;
  if not found then
    raise exception 'Tax period not found';
  end if;

  -- Re-check after the period lock so concurrent retries with the same
  -- request key return the first committed remittance instead of racing into
  -- the unique constraint or over-remittance validation.
  select remittance.id
  into v_existing
  from public.platform_tax_remittances remittance
  where remittance.request_key = p_request_key;
  if found then
    return v_existing;
  end if;

  if v_amount <= 0 then
    raise exception 'Remittance amount must be greater than zero';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;
  if p_payment_date > v_today then
    raise exception 'Payment date cannot be in the future';
  end if;
  if p_payment_date < v_period.period_start then
    raise exception 'Payment date cannot be before the tax period begins';
  end if;
  if v_method is null or char_length(v_method) not between 2 and 50 then
    raise exception 'Payment method must be 2 to 50 characters';
  end if;
  if v_reference is null or char_length(v_reference) not between 3 and 120 then
    raise exception 'Payment reference must be 3 to 120 characters';
  end if;
  if v_receipt_path is null or char_length(v_receipt_path) > 500 then
    raise exception 'Payment receipt evidence is required';
  end if;
  if left(v_receipt_path, char_length(v_period.id::text) + 1) <> concat(v_period.id::text, '/') then
    raise exception 'Receipt path must belong to the selected tax period';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'tax-remittance-receipts'
      and object.name = v_receipt_path
  ) then
    raise exception 'Uploaded tax payment evidence was not found';
  end if;
  if v_note is not null and char_length(v_note) not between 3 and 500 then
    raise exception 'Payment note must be 3 to 500 characters';
  end if;

  v_current_base := private.platform_commission_for_period(v_period.period_start, v_period.period_end);
  v_current_due := round(v_current_base * v_period.tax_rate_percent / 100, 2);

  select coalesce(sum(remittance.amount_etb), 0)
  into v_paid
  from public.platform_tax_remittances remittance
  where remittance.tax_period_id = v_period.id;

  v_outstanding := greatest(v_current_due - v_paid, 0);
  if v_outstanding <= 0 then
    raise exception 'This tax period has no outstanding balance';
  end if;
  if v_amount > v_outstanding then
    raise exception 'Remittance exceeds the current outstanding tax balance';
  end if;

  insert into public.platform_tax_remittances (
    request_key, tax_period_id, amount_etb, payment_date,
    payment_method, reference, receipt_path, note, paid_by
  ) values (
    p_request_key, v_period.id, v_amount, p_payment_date,
    v_method, v_reference, v_receipt_path, v_note, v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_record_platform_tax_remittance(
  uuid, numeric, date, text, text, text, text, uuid
) from public, anon;
grant execute on function public.admin_record_platform_tax_remittance(
  uuid, numeric, date, text, text, text, text, uuid
) to authenticated;

create or replace function public.admin_platform_tax_control()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  return (
    with period_base as (
      select
        period.*,
        private.platform_commission_for_period(period.period_start, period.period_end)
          as current_commission_base_etb
      from public.platform_tax_periods period
    ),
    remitted as (
      select
        remittance.tax_period_id,
        coalesce(sum(remittance.amount_etb), 0)::numeric as paid_etb
      from public.platform_tax_remittances remittance
      group by remittance.tax_period_id
    ),
    period_calc as (
      select
        period.*,
        round(period.current_commission_base_etb * period.tax_rate_percent / 100, 2)::numeric
          as current_tax_due_etb,
        coalesce(remitted.paid_etb, 0)::numeric as paid_etb
      from period_base period
      left join remitted on remitted.tax_period_id = period.id
    ),
    period_status as (
      select
        period.*,
        greatest(period.current_tax_due_etb - period.paid_etb, 0)::numeric as outstanding_etb,
        greatest(period.paid_etb - period.current_tax_due_etb, 0)::numeric as credit_etb,
        case
          when period.paid_etb >= period.current_tax_due_etb then 'paid'
          when period.paid_etb > 0 then 'partial'
          else 'due'
        end::text as status
      from period_calc period
    ),
    all_time as (
      select private.platform_commission_for_period(
        date '1970-01-01',
        timezone('Africa/Addis_Ababa', now())::date
      )::numeric as commission_base_etb
    ),
    summary as (
      select
        all_time.commission_base_etb as all_time_commission_etb,
        round(all_time.commission_base_etb * 0.15, 2)::numeric as all_time_tax_reserve_etb,
        coalesce(sum(period.current_tax_due_etb), 0)::numeric as total_due_etb,
        greatest(
          round(all_time.commission_base_etb * 0.15, 2)
            - coalesce(sum(period.current_tax_due_etb), 0),
          0
        )::numeric as unperiodized_tax_etb,
        coalesce(sum(period.paid_etb), 0)::numeric as total_paid_etb,
        coalesce(sum(period.outstanding_etb), 0)::numeric as total_outstanding_etb,
        coalesce(sum(period.credit_etb), 0)::numeric as total_credit_etb,
        count(*) filter (where period.status = 'due')::bigint as due_count,
        count(*) filter (where period.status = 'partial')::bigint as partial_count,
        count(*) filter (where period.status = 'paid')::bigint as paid_count
      from all_time
      left join period_status period on true
      group by all_time.commission_base_etb
    )
    select jsonb_build_object(
      'summary', (
        select jsonb_build_object(
          'taxRatePercent', 15,
          'allTimeCommissionEtb', summary.all_time_commission_etb,
          'allTimeTaxReserveEtb', summary.all_time_tax_reserve_etb,
          'periodizedTaxDueEtb', summary.total_due_etb,
          'unperiodizedTaxEtb', summary.unperiodized_tax_etb,
          'totalDueEtb', summary.total_due_etb,
          'totalPaidEtb', summary.total_paid_etb,
          'totalOutstandingEtb', summary.total_outstanding_etb,
          'totalCreditEtb', summary.total_credit_etb,
          'dueCount', summary.due_count,
          'partialCount', summary.partial_count,
          'paidCount', summary.paid_count
        )
        from summary
      ),
      'periods', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', period.id,
            'periodStart', period.period_start,
            'periodEnd', period.period_end,
            'taxRatePercent', period.tax_rate_percent,
            'commissionBaseSnapshotEtb', period.commission_base_snapshot_etb,
            'taxDueSnapshotEtb', period.tax_due_snapshot_etb,
            'currentCommissionBaseEtb', period.current_commission_base_etb,
            'currentTaxDueEtb', period.current_tax_due_etb,
            'paidEtb', period.paid_etb,
            'outstandingEtb', period.outstanding_etb,
            'creditEtb', period.credit_etb,
            'status', period.status,
            'createdBy', period.created_by,
            'createdAt', period.created_at
          )
          order by period.period_end desc, period.created_at desc
        ), '[]'::jsonb)
        from period_status period
      ),
      'remittances', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', remittance.id,
            'taxPeriodId', remittance.tax_period_id,
            'amountEtb', remittance.amount_etb,
            'paymentDate', remittance.payment_date,
            'paymentMethod', remittance.payment_method,
            'reference', remittance.reference,
            'receiptPath', remittance.receipt_path,
            'note', remittance.note,
            'paidBy', remittance.paid_by,
            'paidByName', profile.full_name,
            'createdAt', remittance.created_at
          )
          order by remittance.payment_date desc, remittance.created_at desc
        ), '[]'::jsonb)
        from public.platform_tax_remittances remittance
        left join public.profiles profile on profile.id = remittance.paid_by
      ),
      'audit', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', audit.id,
            'eventType', audit.event_type,
            'taxPeriodId', audit.tax_period_id,
            'remittanceId', audit.remittance_id,
            'actorId', audit.actor_id,
            'actorName', profile.full_name,
            'details', audit.details,
            'createdAt', audit.created_at
          )
          order by audit.created_at desc, audit.id desc
        ), '[]'::jsonb)
        from public.platform_tax_audit audit
        left join public.profiles profile on profile.id = audit.actor_id
      )
    )
  );
end;
$$;

revoke all on function public.admin_platform_tax_control() from public, anon;
grant execute on function public.admin_platform_tax_control() to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'tax-remittance-receipts',
  'tax-remittance-receipts',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict(id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tax remittance receipt upload" on storage.objects;
create policy "tax remittance receipt upload"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tax-remittance-receipts'
    and (select private.is_admin_or_ceo())
    and exists (
      select 1
      from public.platform_tax_periods period
      where period.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "tax remittance receipt read" on storage.objects;
create policy "tax remittance receipt read"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tax-remittance-receipts'
    and (select private.is_admin_or_ceo())
    and exists (
      select 1
      from public.platform_tax_periods period
      where period.id::text = (storage.foldername(name))[1]
    )
  );

-- No UPDATE or DELETE policy is created for this bucket. Evidence objects are
-- intentionally append-only for authenticated Admin/CEO users.

comment on table public.platform_tax_periods is
  'Immutable tax-period definitions with creation-time liability snapshots; current liability is recalculated from canonical commission.';
comment on table public.platform_tax_remittances is
  'Immutable government-tax remittance evidence ledger. New payments are appended; historical rows are never edited or deleted.';
comment on function public.admin_platform_tax_control() is
  'Admin/CEO tax control report with due, partial and paid status derived from canonical commission and immutable remittances.';

notify pgrst, 'reload schema';
commit;
