-- Reconcile both commission ledgers in every driver wallet calculation.
-- Bank/mobile-money payments accrue in driver_payment_confirmations, while
-- direct driver collections accrue in driver_commission_charges. A payment
-- present in both sources is counted once, with the confirmation as canonical.

create or replace function private.driver_commission_charged_total(
  p_driver_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(commission_ledger.commission_etb), 0)::numeric
  from (
    select confirmation.payment_id, round(confirmation.commission_etb, 2) as commission_etb
    from public.driver_payment_confirmations confirmation
    where confirmation.driver_id = p_driver_id
      and confirmation.commission_reversed_at is null

    union all

    select charge.payment_id, round(charge.commission_etb, 2) as commission_etb
    from public.driver_commission_charges charge
    where charge.driver_id = p_driver_id
      and charge.status = 'active'
      and not exists (
        select 1
        from public.driver_payment_confirmations confirmation
        where confirmation.payment_id = charge.payment_id
      )
  ) commission_ledger;
$$;

revoke all on function private.driver_commission_charged_total(uuid)
  from public, anon, authenticated;

create or replace function public.driver_commission_balance(p_driver_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_leadership boolean := false;
  v_balance numeric;
begin
  if v_is_service then
    v_is_leadership := true;
  elsif v_uid is not null then
    select exists (
      select 1
      from public.profiles profile
      where profile.id = v_uid
        and profile.role::text in ('admin', 'ceo')
    ) into v_is_leadership;
  end if;

  if v_uid is null and not v_is_service then
    raise exception 'Authentication required';
  end if;
  if p_driver_id is distinct from v_uid
    and not v_is_leadership
  then
    raise exception 'You can only view your own commission balance';
  end if;

  select greatest(
    0,
    private.driver_commission_charged_total(p_driver_id)
      - coalesce((
          select sum(payment.amount_etb)
          from public.driver_commission_payments payment
          where payment.driver_id = p_driver_id
            and payment.status = 'approved'
        ), 0)
      - coalesce((
          select sum(deposit.amount_etb)
          from public.driver_commission_deposits deposit
          where deposit.driver_id = p_driver_id
            and deposit.status = 'active'
        ), 0)
  )
  into v_balance;

  return v_balance;
end;
$$;

create or replace function public.my_driver_commission_summary()
returns table(
  balance_etb numeric,
  charged_etb numeric,
  approved_paid_etb numeric,
  pending_etb numeric,
  blocked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if v_uid is null and not v_is_service then
    raise exception 'Authentication required';
  end if;

  return query
  with totals as (
    select
      private.driver_commission_charged_total(v_uid) as charged,
      coalesce((
        select sum(payment.amount_etb)
        from public.driver_commission_payments payment
        where payment.driver_id = v_uid
          and payment.status = 'approved'
      ), 0)::numeric as approved_paid,
      coalesce((
        select sum(payment.amount_etb)
        from public.driver_commission_payments payment
        where payment.driver_id = v_uid
          and payment.status = 'pending'
      ), 0)::numeric as pending,
      coalesce((
        select sum(deposit.amount_etb)
        from public.driver_commission_deposits deposit
        where deposit.driver_id = v_uid
          and deposit.status = 'active'
      ), 0)::numeric as deposited
  ), reconciled as (
    select
      charged,
      approved_paid,
      pending,
      greatest(0, charged - approved_paid - deposited) as balance
    from totals
  )
  select
    balance,
    charged,
    approved_paid,
    pending,
    balance > 0.005
  from reconciled;
end;
$$;

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
      select 1
      from public.profiles profile
      where profile.id = v_uid
        and profile.role::text in ('admin', 'ceo')
    ) into v_is_leadership;
  end if;

  if v_uid is null and not v_is_service then
    raise exception 'Authentication required';
  end if;
  if p_driver_id is distinct from v_uid
    and not v_is_leadership
  then
    raise exception 'You can only view your own financial summary';
  end if;

  return query
  with totals as (
    select
      (select count(*)
       from public.orders driver_order
       where driver_order.driver_id = p_driver_id
         and driver_order.status = 'delivered')::bigint as trips,
      coalesce((
        select sum(payment.amount_etb)
        from public.payments payment
        join public.orders driver_order on driver_order.id = payment.order_id
        where driver_order.driver_id = p_driver_id
          and payment.event = 'released'
      ), 0)::numeric as gross,
      private.driver_commission_charged_total(p_driver_id) as charged,
      coalesce((
        select sum(payment.amount_etb)
        from public.driver_commission_payments payment
        where payment.driver_id = p_driver_id
          and payment.status = 'approved'
      ), 0)::numeric as paid,
      coalesce((
        select sum(deposit.amount_etb)
        from public.driver_commission_deposits deposit
        where deposit.driver_id = p_driver_id
          and deposit.status = 'active'
      ), 0)::numeric as deposited
  ), reconciled as (
    select
      *,
      greatest(0, charged - paid) as unpaid_commission
    from totals
  )
  select
    trips,
    gross,
    charged,
    paid,
    deposited,
    greatest(0, deposited - unpaid_commission),
    greatest(0, unpaid_commission - deposited)
  from reconciled;
end;
$$;

revoke all on function public.driver_commission_balance(uuid)
  from public, anon;
grant execute on function public.driver_commission_balance(uuid)
  to authenticated, service_role;

revoke all on function public.my_driver_commission_summary()
  from public, anon;
grant execute on function public.my_driver_commission_summary()
  to authenticated, service_role;

revoke all on function public.driver_financial_summary(uuid)
  from public, anon;
grant execute on function public.driver_financial_summary(uuid)
  to authenticated, service_role;

comment on function private.driver_commission_charged_total(uuid) is
  'Internal canonical commission total. Unreversed payment confirmations are authoritative; active direct-collection charges are included only when no confirmation exists for the payment.';

comment on function public.driver_commission_balance(uuid) is
  'Outstanding driver commission after approved settlements and active prepaid deposits, using the canonical duplicate-free commission ledger.';

comment on function public.my_driver_commission_summary() is
  'Authenticated driver commission wallet summary using confirmed bank/mobile payments and active direct collections exactly once.';

comment on function public.driver_financial_summary(uuid) is
  'Canonical driver financial summary. Applies unpaid duplicate-free commission against active deposits without mutating ledger history.';

notify pgrst, 'reload schema';
