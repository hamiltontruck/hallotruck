-- Issue #189: enforce one canonical external transaction reference without rewriting payment history.
-- Existing conflicts remain immutable and are surfaced through a leadership-only exception RPC.

begin;

create table if not exists private.payment_reference_registry (
  provider_key text not null,
  reference_key text not null,
  canonical_payment_id uuid not null
    references public.payments(id) on delete restrict
    deferrable initially deferred,
  canonical_order_id uuid not null
    references public.orders(id) on delete restrict,
  canonical_event public.payment_event not null,
  legacy_conflict boolean not null default false,
  conflict_order_count integer not null default 1
    check (conflict_order_count >= 1),
  conflict_active_count integer not null default 0
    check (conflict_active_count >= 0),
  first_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (provider_key, reference_key),
  unique (canonical_payment_id)
);

alter table private.payment_reference_registry enable row level security;
revoke all on table private.payment_reference_registry from public, anon, authenticated;

create index if not exists payment_reference_registry_order_idx
  on private.payment_reference_registry(canonical_order_id);

create or replace function private.payment_reference_provider_key(p_provider text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select lower(btrim(coalesce(p_provider, '')));
$function$;

create or replace function private.payment_reference_key(p_reference text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select lower(btrim(coalesce(p_reference, '')));
$function$;

create or replace function private.is_external_payment_reference(
  p_provider text,
  p_reference text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select nullif(btrim(coalesce(p_reference, '')), '') is not null
    and private.payment_reference_provider_key(p_provider) not in (
      'cash',
      'cash_to_driver',
      'driver_cash',
      'financial_correction',
      'credit_refund',
      'internal'
    );
$function$;

revoke all on function private.payment_reference_provider_key(text)
  from public, anon, authenticated;
revoke all on function private.payment_reference_key(text)
  from public, anon, authenticated;
revoke all on function private.is_external_payment_reference(text, text)
  from public, anon, authenticated;

with normalized as (
  select
    payment.id,
    payment.order_id,
    payment.event,
    payment.created_at,
    private.payment_reference_provider_key(payment.provider) as provider_key,
    private.payment_reference_key(payment.provider_ref) as reference_key
  from public.payments payment
  where private.is_external_payment_reference(
    payment.provider,
    payment.provider_ref
  )
), grouped as (
  select
    normalized.provider_key,
    normalized.reference_key,
    count(distinct normalized.order_id)::integer as order_count,
    count(*) filter (
      where normalized.event not in ('failed', 'refunded')
    )::integer as active_count,
    min(normalized.created_at) as first_seen_at
  from normalized
  group by normalized.provider_key, normalized.reference_key
), canonical as (
  select distinct on (normalized.provider_key, normalized.reference_key)
    normalized.provider_key,
    normalized.reference_key,
    normalized.id as canonical_payment_id,
    normalized.order_id as canonical_order_id,
    normalized.event as canonical_event
  from normalized
  order by
    normalized.provider_key,
    normalized.reference_key,
    case when normalized.event not in ('failed', 'refunded') then 0 else 1 end,
    normalized.created_at,
    normalized.id
)
insert into private.payment_reference_registry (
  provider_key,
  reference_key,
  canonical_payment_id,
  canonical_order_id,
  canonical_event,
  legacy_conflict,
  conflict_order_count,
  conflict_active_count,
  first_seen_at
)
select
  canonical.provider_key,
  canonical.reference_key,
  canonical.canonical_payment_id,
  canonical.canonical_order_id,
  canonical.canonical_event,
  grouped.order_count > 1 or grouped.active_count > 1,
  grouped.order_count,
  grouped.active_count,
  grouped.first_seen_at
from canonical
join grouped using (provider_key, reference_key)
on conflict (provider_key, reference_key) do nothing;

create or replace function private.enforce_payment_reference_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider_key text;
  v_reference_key text;
  v_registry private.payment_reference_registry%rowtype;
  v_same_reference boolean := false;
begin
  if not private.is_external_payment_reference(new.provider, new.provider_ref) then
    return new;
  end if;

  v_provider_key := private.payment_reference_provider_key(new.provider);
  v_reference_key := private.payment_reference_key(new.provider_ref);

  if tg_op = 'UPDATE' then
    v_same_reference :=
      private.payment_reference_provider_key(old.provider) = v_provider_key
      and private.payment_reference_key(old.provider_ref) = v_reference_key
      and old.order_id = new.order_id;
  end if;

  insert into private.payment_reference_registry (
    provider_key,
    reference_key,
    canonical_payment_id,
    canonical_order_id,
    canonical_event,
    legacy_conflict,
    conflict_order_count,
    conflict_active_count,
    first_seen_at
  ) values (
    v_provider_key,
    v_reference_key,
    new.id,
    new.order_id,
    new.event,
    false,
    1,
    case when new.event not in ('failed', 'refunded') then 1 else 0 end,
    coalesce(new.created_at, now())
  )
  on conflict (provider_key, reference_key) do nothing;

  select registry.*
  into v_registry
  from private.payment_reference_registry registry
  where registry.provider_key = v_provider_key
    and registry.reference_key = v_reference_key
  for update;

  if v_registry.canonical_payment_id = new.id then
    return new;
  end if;

  -- Existing legacy conflicts may only move toward a non-active terminal state.
  if tg_op = 'UPDATE'
    and v_same_reference
    and v_registry.legacy_conflict
    and new.event in ('failed', 'refunded')
  then
    return new;
  end if;

  raise log 'Denied duplicate payment reference actor=% order=% canonical_order=%',
    auth.uid(), new.order_id, v_registry.canonical_order_id;
  raise exception 'Transaction ID is already assigned to another payment for this provider.'
    using
      errcode = '23505',
      detail = 'Review the Finance reference-conflict queue instead of creating another active payment.';
end;
$function$;

revoke all on function private.enforce_payment_reference_integrity()
  from public, anon, authenticated;

drop trigger if exists payments_unique_reference_guard on public.payments;
drop function if exists public.prevent_duplicate_payment_reference();

create trigger payments_reference_integrity_guard
before insert or update of provider, provider_ref, event, order_id
on public.payments
for each row execute function private.enforce_payment_reference_integrity();

-- All payment mutations must pass through audited, role-aware RPCs.
revoke all on table public.payments from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.payments from authenticated;
grant select on table public.payments to authenticated;

drop policy if exists "payments admin manage" on public.payments;
drop policy if exists "payments: participants read" on public.payments;
drop policy if exists "payments participants or leadership read" on public.payments;

create policy "payments participants or leadership read"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.orders customer_order
    where customer_order.id = payments.order_id
      and customer_order.customer_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.orders driver_order
    where driver_order.id = payments.order_id
      and driver_order.driver_id = (select auth.uid())
      and payments.event in ('held_escrow', 'released', 'refunded')
  )
  or (select private.is_admin_or_ceo())
);

create or replace function public.admin_payment_reference_conflicts()
returns table (
  payment_id uuid,
  order_id uuid,
  tracking_id text,
  provider text,
  reference_fingerprint text,
  masked_reference text,
  amount_etb numeric,
  event public.payment_event,
  created_at timestamptz,
  classification text,
  canonical_payment_id uuid,
  order_count integer,
  active_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform private.require_active_leadership(
    'admin_payment_reference_conflicts'
  );

  return query
  with normalized as (
    select
      payment.*,
      private.payment_reference_provider_key(payment.provider) as provider_key,
      private.payment_reference_key(payment.provider_ref) as reference_key
    from public.payments payment
    where private.is_external_payment_reference(
      payment.provider,
      payment.provider_ref
    )
  ), grouped as (
    select
      normalized.provider_key,
      normalized.reference_key,
      count(distinct normalized.order_id)::integer as order_count,
      count(*) filter (
        where normalized.event not in ('failed', 'refunded')
      )::integer as active_count
    from normalized
    group by normalized.provider_key, normalized.reference_key
    having count(distinct normalized.order_id) > 1
      or count(*) filter (
        where normalized.event not in ('failed', 'refunded')
      ) > 1
  ), ranked as (
    select
      normalized.*,
      row_number() over (
        partition by normalized.provider_key, normalized.reference_key
        order by
          case when normalized.event not in ('failed', 'refunded') then 0 else 1 end,
          normalized.created_at,
          normalized.id
      ) as canonical_rank
    from normalized
    join grouped
      on grouped.provider_key = normalized.provider_key
     and grouped.reference_key = normalized.reference_key
  ), canonical as (
    select
      ranked.provider_key,
      ranked.reference_key,
      ranked.id as canonical_payment_id
    from ranked
    where ranked.canonical_rank = 1
  )
  select
    ranked.id,
    ranked.order_id,
    trip_order.tracking_id,
    ranked.provider,
    md5(ranked.provider_key || ':' || ranked.reference_key),
    case
      when char_length(ranked.reference_key) <= 4
        then repeat('*', char_length(ranked.reference_key))
      when char_length(ranked.reference_key) <= 8
        then left(ranked.reference_key, 1)
          || repeat('*', char_length(ranked.reference_key) - 2)
          || right(ranked.reference_key, 1)
      else left(ranked.reference_key, 2)
        || repeat('*', char_length(ranked.reference_key) - 6)
        || right(ranked.reference_key, 4)
    end,
    ranked.amount_etb,
    ranked.event,
    ranked.created_at,
    case
      when ranked.event = 'refunded' then 'refunded'
      when ranked.event = 'failed' then 'superseded'
      when ranked.id = canonical.canonical_payment_id then 'canonical'
      else 'legacy_conflict'
    end,
    canonical.canonical_payment_id,
    grouped.order_count,
    grouped.active_count
  from ranked
  join grouped
    on grouped.provider_key = ranked.provider_key
   and grouped.reference_key = ranked.reference_key
  join canonical
    on canonical.provider_key = ranked.provider_key
   and canonical.reference_key = ranked.reference_key
  join public.orders trip_order on trip_order.id = ranked.order_id
  order by
    ranked.provider_key,
    ranked.reference_key,
    ranked.created_at,
    ranked.id;
end;
$function$;

revoke all on function public.admin_payment_reference_conflicts()
  from public, anon;
grant execute on function public.admin_payment_reference_conflicts()
  to authenticated;

comment on table private.payment_reference_registry is
  'Canonical normalized external payment references. Existing duplicate rows remain immutable and are marked as legacy conflicts.';
comment on function public.admin_payment_reference_conflicts() is
  'Leadership-only read model for canonical, superseded, refunded and legacy-conflict payment references.';

commit;
