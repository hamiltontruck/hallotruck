-- Reconcile commission accrued through cash-to-driver charges and
-- bank/Telebirr driver payment confirmations without mutating history.

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
  v_is_leadership boolean := false;
begin
  if auth.role() = 'service_role' then
    v_is_leadership := true;
  elsif v_uid is not null then
    select exists (
      select 1
      from public.profiles p
      where p.id = v_uid
        and p.role::text in ('admin', 'ceo')
    ) into v_is_leadership;
  end if;

  if v_uid is null and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if p_driver_id is distinct from v_uid and not v_is_leadership then
    raise exception 'You can only view your own financial summary';
  end if;

  return query
  with charge_ledger as (
    select
      c.payment_id,
      c.order_id,
      round(c.commission_etb, 2) as commission_etb
    from public.driver_commission_charges c
    where c.driver_id = p_driver_id
      and c.status = 'active'
  ),
  confirmation_ledger as (
    select
      f.payment_id,
      f.order_id,
      round(f.commission_etb, 2) as commission_etb
    from public.driver_payment_confirmations f
    where f.driver_id = p_driver_id
      and f.commission_reversed_at is null
  ),
  canonical_commissions as (
    select
      coalesce(c.payment_id, f.payment_id) as payment_id,
      coalesce(c.order_id, f.order_id) as order_id,
      -- The same payment may legitimately be represented in both ledgers.
      -- Count it once, preferring the audited charge and otherwise the
      -- confirmation amount.
      coalesce(c.commission_etb, f.commission_etb, 0)::numeric as commission_etb
    from charge_ledger c
    full outer join confirmation_ledger f
      on f.payment_id = c.payment_id
  ),
  vals as (
    select
      (select count(*)
         from public.orders o
        where o.driver_id = p_driver_id
          and o.status = 'delivered')::bigint as trips,
      coalesce((
        select sum(p.amount_etb)
        from public.payments p
        join public.orders o on o.id = p.order_id
        where o.driver_id = p_driver_id
          and p.event = 'released'
      ), 0)::numeric as gross,
      coalesce((select sum(cc.commission_etb) from canonical_commissions cc), 0)::numeric as charged,
      coalesce((
        select sum(cp.amount_etb)
        from public.driver_commission_payments cp
        where cp.driver_id = p_driver_id
          and cp.status = 'approved'
      ), 0)::numeric as paid,
      coalesce((
        select sum(d.amount_etb)
        from public.driver_commission_deposits d
        where d.driver_id = p_driver_id
          and d.status = 'active'
      ), 0)::numeric as deposited
  ),
  reconciled as (
    select
      *,
      greatest(0::numeric, charged - paid) as unpaid_commission
    from vals
  )
  select
    trips,
    gross,
    charged,
    paid,
    deposited,
    greatest(0::numeric, deposited - unpaid_commission),
    greatest(0::numeric, unpaid_commission - deposited)
  from reconciled;
end;
$$;

revoke all on function public.driver_financial_summary(uuid) from public;
grant execute on function public.driver_financial_summary(uuid) to authenticated;
grant execute on function public.driver_financial_summary(uuid) to service_role;

comment on function public.driver_financial_summary(uuid) is
  'Canonical driver financial summary. Reconciles active commission charges with unreversed payment confirmations by payment_id, subtracts approved payments, then applies unpaid commission against active deposits.';
