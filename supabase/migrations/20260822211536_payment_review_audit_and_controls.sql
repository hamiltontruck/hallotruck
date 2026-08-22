-- Add an auditable Admin/CEO payment review flow.

alter table public.payments
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_rejection_reason_length'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_rejection_reason_length
      check (rejection_reason is null or char_length(rejection_reason) between 5 and 500);
  end if;
end
$$;

create table if not exists public.payment_review_audit (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null check (action in ('verified', 'rejected', 'resubmitted')),
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists payment_review_audit_payment_idx
  on public.payment_review_audit(payment_id, created_at desc);
create index if not exists payment_review_audit_order_idx
  on public.payment_review_audit(order_id, created_at desc);
create index if not exists payments_review_queue_idx
  on public.payments(event, created_at desc)
  where event in ('initiated', 'failed');

alter table public.payment_review_audit enable row level security;

drop policy if exists "payment review audit leadership read" on public.payment_review_audit;
create policy "payment review audit leadership read"
on public.payment_review_audit
for select
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

revoke all on public.payment_review_audit from public, anon;
grant select on public.payment_review_audit to authenticated;

create or replace function public.order_payment_ready_for_dispatch(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and coalesce(o.price_etb, 0) > 0
      and coalesce((
        select sum(
          case
            when p.event in ('held_escrow', 'released') then p.amount_etb
            when p.event = 'refunded' then -p.amount_etb
            else 0
          end
        )
        from public.payments p
        where p.order_id = o.id
      ), 0) + 0.005 >= coalesce(o.price_etb, 0)
  );
$$;

revoke all on function public.order_payment_ready_for_dispatch(uuid) from public, anon;
grant execute on function public.order_payment_ready_for_dispatch(uuid) to authenticated;

create or replace function public.prepare_payment_review_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_total numeric;
  v_other_verified numeric;
  v_actor uuid := auth.uid();
  v_is_verification boolean := false;
  v_is_rejection boolean := false;
  v_is_resubmission boolean := false;
begin
  if tg_op = 'INSERT' then
    v_is_verification := new.event = 'held_escrow';
    v_is_rejection := new.event = 'failed';
  else
    v_is_verification := old.event = 'initiated' and new.event = 'held_escrow' and old.event is distinct from new.event;
    v_is_rejection := old.event = 'initiated' and new.event = 'failed' and old.event is distinct from new.event;
    v_is_resubmission := old.event = 'failed' and new.event = 'initiated' and old.event is distinct from new.event;
  end if;

  if v_is_verification then
    if lower(btrim(coalesce(new.provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash')
       and nullif(btrim(coalesce(new.receipt_path, '')), '') is null then
      raise exception 'A customer receipt is required before verifying this non-cash payment';
    end if;

    select coalesce(o.price_etb, 0),
           coalesce((
             select sum(
               case
                 when other.event in ('held_escrow', 'released') then other.amount_etb
                 when other.event = 'refunded' then -other.amount_etb
                 else 0
               end
             )
             from public.payments other
             where other.order_id = o.id
               and other.id <> new.id
           ), 0)
      into v_order_total, v_other_verified
    from public.orders o
    where o.id = new.order_id;

    if not found then
      raise exception 'Order not found for payment review';
    end if;

    if v_other_verified + new.amount_etb > v_order_total + 0.005 then
      raise exception 'Verified payment would exceed the invoice total by ETB %',
        round(v_other_verified + new.amount_etb - v_order_total, 2);
    end if;

    new.reviewed_by := coalesce(new.reviewed_by, v_actor);
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.rejection_reason := null;
  elsif v_is_rejection then
    if nullif(btrim(coalesce(new.rejection_reason, '')), '') is null then
      raise exception 'A rejection reason is required';
    end if;
    new.rejection_reason := btrim(new.rejection_reason);
    new.reviewed_by := coalesce(new.reviewed_by, v_actor);
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif v_is_resubmission then
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_prepare_review_metadata_insert on public.payments;
create trigger payments_prepare_review_metadata_insert
before insert
on public.payments
for each row
execute function public.prepare_payment_review_metadata();

drop trigger if exists payments_prepare_review_metadata on public.payments;
create trigger payments_prepare_review_metadata
before update of event, rejection_reason, reviewed_by, reviewed_at
on public.payments
for each row
execute function public.prepare_payment_review_metadata();

create or replace function public.audit_payment_review_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_reason text;
  v_actor uuid;
begin
  if tg_op = 'INSERT' and new.event = 'held_escrow' then
    v_action := 'verified';
    v_reason := null;
    v_actor := coalesce(new.reviewed_by, auth.uid());
  elsif tg_op = 'INSERT' and new.event = 'failed' then
    v_action := 'rejected';
    v_reason := new.rejection_reason;
    v_actor := coalesce(new.reviewed_by, auth.uid());
  elsif tg_op = 'UPDATE' and old.event = 'initiated' and new.event = 'held_escrow' then
    v_action := 'verified';
    v_reason := null;
    v_actor := coalesce(new.reviewed_by, auth.uid());
  elsif tg_op = 'UPDATE' and old.event = 'initiated' and new.event = 'failed' then
    v_action := 'rejected';
    v_reason := new.rejection_reason;
    v_actor := coalesce(new.reviewed_by, auth.uid());
  elsif tg_op = 'UPDATE' and old.event = 'failed' and new.event = 'initiated' then
    v_action := 'resubmitted';
    v_reason := old.rejection_reason;
    v_actor := auth.uid();
  else
    return new;
  end if;

  insert into public.payment_review_audit(payment_id, order_id, action, actor_id, reason)
  values (new.id, new.order_id, v_action, v_actor, v_reason);

  return new;
end;
$$;

drop trigger if exists payments_audit_review_insert on public.payments;
create trigger payments_audit_review_insert
after insert
on public.payments
for each row
when (new.event in ('held_escrow', 'failed'))
execute function public.audit_payment_review_transition();

drop trigger if exists payments_audit_review_transition on public.payments;
create trigger payments_audit_review_transition
after update of event
on public.payments
for each row
when (old.event is distinct from new.event)
execute function public.audit_payment_review_transition();

create or replace function public.admin_review_customer_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.payment_event;
  v_order_id uuid;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select p.event, p.order_id
    into v_event, v_order_id
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_event <> 'initiated' then
    raise exception 'Only initiated payments can be reviewed';
  end if;

  if p_approve then
    update public.payments
    set event = 'held_escrow',
        reviewed_by = v_actor,
        reviewed_at = now(),
        rejection_reason = null
    where id = p_payment_id;
  else
    if v_reason is null or char_length(v_reason) < 5 then
      raise exception 'Write a rejection reason of at least 5 characters';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'Rejection reason must be 500 characters or fewer';
    end if;

    update public.payments
    set event = 'failed',
        reviewed_by = v_actor,
        reviewed_at = now(),
        rejection_reason = v_reason
    where id = p_payment_id;

    update public.customer_dispatch_requests
    set status = 'expired',
        updated_at = now()
    where order_id = v_order_id
      and status = 'requested';
  end if;

  perform public.recompute_order_payment_status(v_order_id);
end;
$$;

revoke all on function public.admin_review_customer_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_customer_payment(uuid, boolean, text) to authenticated;
