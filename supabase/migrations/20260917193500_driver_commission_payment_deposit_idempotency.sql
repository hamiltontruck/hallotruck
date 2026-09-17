-- Commission payments are independent prepaid wallet deposits.
-- Drivers may submit ETB 1,000-100,000 regardless of current commission due.
-- First approval creates exactly one linked active deposit. Legacy approved
-- payments remain valid without backfilling or mutating historical rows.

begin;

alter table public.driver_commission_deposits
  drop constraint if exists driver_commission_deposits_amount_etb_check;
alter table public.driver_commission_deposits
  add constraint driver_commission_deposits_amount_etb_check
  check (amount_etb between 1000 and 100000);

alter table public.driver_commission_deposits
  add column if not exists commission_payment_id uuid
  references public.driver_commission_payments(id) on delete restrict;

create unique index if not exists driver_commission_deposits_commission_payment_unique
  on public.driver_commission_deposits(commission_payment_id)
  where commission_payment_id is not null;

-- Approved payments created before this migration remain direct wallet credits.
-- New approvals create a linked deposit instead, so the same payment is never
-- counted once as an approved payment and again as a deposit.
create or replace function private.driver_commission_unlinked_approved_total(
  p_driver_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(sum(payment.amount_etb), 0)::numeric
  from public.driver_commission_payments payment
  where payment.driver_id = p_driver_id
    and payment.status = 'approved'
    and not exists (
      select 1
      from public.driver_commission_deposits deposit
      where deposit.commission_payment_id = payment.id
    );
$function$;

revoke all on function private.driver_commission_unlinked_approved_total(uuid)
  from public, anon, authenticated;

create or replace function public.submit_driver_commission_payment(
  p_provider text,
  p_transaction_id text,
  p_amount_etb numeric,
  p_receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver_id uuid := auth.uid();
  v_payment_id uuid;
  v_amount numeric;
begin
  if v_driver_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_approved_driver() then
    raise exception 'Driver account is not approved';
  end if;
  if nullif(btrim(p_provider), '') is null then
    raise exception 'Payment provider is required';
  end if;
  if nullif(btrim(p_transaction_id), '') is null then
    raise exception 'Transaction ID is required';
  end if;
  if nullif(btrim(p_receipt_path), '') is null then
    raise exception 'Receipt screenshot or PDF is required';
  end if;
  if p_amount_etb is null or p_amount_etb < 1000 or p_amount_etb > 100000 then
    raise exception 'Commission payment amount must be between ETB 1,000 and ETB 100,000';
  end if;

  v_amount := round(p_amount_etb, 2);

  insert into public.driver_commission_payments(
    driver_id,
    provider,
    transaction_id,
    amount_etb,
    receipt_path
  ) values (
    v_driver_id,
    btrim(p_provider),
    btrim(p_transaction_id),
    v_amount,
    btrim(p_receipt_path)
  )
  returning id into v_payment_id;

  insert into public.driver_commission_audit(
    driver_id,
    commission_payment_id,
    action,
    actor_id,
    details
  ) values (
    v_driver_id,
    v_payment_id,
    'submitted',
    v_driver_id,
    jsonb_build_object(
      'provider', btrim(p_provider),
      'transaction_id', btrim(p_transaction_id),
      'amount_etb', v_amount
    )
  );

  return v_payment_id;
exception
  when unique_violation then
    raise exception 'This transaction ID has already been used';
end;
$function$;

-- Issue #188 keeps the public leadership RPC as a guarded wrapper. Replace only
-- its revoked implementation so suspended-leadership protection remains intact.
create or replace function public.admin_review_driver_commission_payment_unchecked_188(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_payment public.driver_commission_payments%rowtype;
  v_deposit_id uuid;
  v_deposit_created boolean := false;
begin
  select *
    into v_payment
  from public.driver_commission_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Commission payment not found';
  end if;

  if p_approve then
    if v_payment.status = 'rejected' then
      raise exception 'Rejected commission payments cannot be approved';
    end if;
    if v_payment.status not in ('pending', 'approved') then
      raise exception 'Commission payment status cannot be approved';
    end if;

    insert into public.driver_commission_deposits(
      driver_id,
      amount_etb,
      reference,
      note,
      created_by,
      commission_payment_id
    ) values (
      v_payment.driver_id,
      round(v_payment.amount_etb, 2),
      'commission-payment:' || v_payment.id::text,
      'Approved commission payment ' || v_payment.transaction_id,
      v_actor,
      v_payment.id
    )
    on conflict (commission_payment_id) where commission_payment_id is not null
      do nothing
    returning id into v_deposit_id;

    v_deposit_created := v_deposit_id is not null;

    if v_deposit_id is null then
      select deposit.id
        into v_deposit_id
      from public.driver_commission_deposits deposit
      where deposit.commission_payment_id = v_payment.id
      limit 1;
    end if;

    if v_payment.status = 'pending' then
      update public.driver_commission_payments
      set
        status = 'approved',
        rejection_reason = null,
        reviewed_by = v_actor,
        reviewed_at = now(),
        updated_at = now()
      where id = p_payment_id;

      insert into public.driver_commission_audit(
        driver_id,
        commission_payment_id,
        action,
        actor_id,
        details
      ) values (
        v_payment.driver_id,
        p_payment_id,
        'approved',
        v_actor,
        jsonb_build_object(
          'amount_etb', round(v_payment.amount_etb, 2),
          'provider', v_payment.provider,
          'transaction_id', v_payment.transaction_id,
          'deposit_id', v_deposit_id,
          'deposit_created', v_deposit_created
        )
      );
    end if;

    return;
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Only pending commission payments can be rejected';
  end if;
  if nullif(btrim(coalesce(p_rejection_reason, '')), '') is null then
    raise exception 'Rejection reason is required';
  end if;

  update public.driver_commission_payments
  set
    status = 'rejected',
    rejection_reason = btrim(p_rejection_reason),
    reviewed_by = v_actor,
    reviewed_at = now(),
    updated_at = now()
  where id = p_payment_id;

  insert into public.driver_commission_audit(
    driver_id,
    commission_payment_id,
    action,
    actor_id,
    details
  ) values (
    v_payment.driver_id,
    p_payment_id,
    'rejected',
    v_actor,
    jsonb_build_object(
      'reason', btrim(p_rejection_reason),
      'amount_etb', v_payment.amount_etb
    )
  );
end;
$function$;

revoke all on function public.admin_review_driver_commission_payment_unchecked_188(uuid, boolean, text)
  from public, anon, authenticated;

create or replace function public.driver_commission_balance_unchecked_188(
  p_driver_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
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
  if p_driver_id is distinct from v_uid and not v_is_leadership then
    raise exception 'You can only view your own commission balance';
  end if;

  select greatest(
    0,
    private.driver_commission_charged_total(p_driver_id)
      - private.driver_commission_unlinked_approved_total(p_driver_id)
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
$function$;

revoke all on function public.driver_commission_balance_unchecked_188(uuid)
  from public, anon, authenticated;

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
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  return query
  select
    public.driver_commission_balance(v_uid),
    private.driver_commission_charged_total(v_uid),
    coalesce((
      select sum(payment.amount_etb)
      from public.driver_commission_payments payment
      where payment.driver_id = v_uid
        and payment.status = 'approved'
    ), 0)::numeric,
    coalesce((
      select sum(payment.amount_etb)
      from public.driver_commission_payments payment
      where payment.driver_id = v_uid
        and payment.status = 'pending'
    ), 0)::numeric,
    public.driver_commission_balance(v_uid) > 0.005;
end;
$function$;

create or replace function public.driver_financial_summary_unchecked_188(
  p_driver_id uuid
)
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
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
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
  if p_driver_id is distinct from v_uid and not v_is_leadership then
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
      private.driver_commission_unlinked_approved_total(p_driver_id) as legacy_paid_credit,
      coalesce((
        select sum(deposit.amount_etb)
        from public.driver_commission_deposits deposit
        where deposit.driver_id = p_driver_id
          and deposit.status = 'active'
      ), 0)::numeric as deposited
  )
  select
    trips,
    gross,
    charged,
    paid,
    deposited,
    greatest(0, legacy_paid_credit + deposited - charged),
    greatest(0, charged - legacy_paid_credit - deposited)
  from totals;
end;
$function$;

revoke all on function public.driver_financial_summary_unchecked_188(uuid)
  from public, anon, authenticated;

revoke all on function public.submit_driver_commission_payment(text, text, numeric, text)
  from public, anon;
grant execute on function public.submit_driver_commission_payment(text, text, numeric, text)
  to authenticated;

comment on column public.driver_commission_deposits.commission_payment_id is
  'Approved driver commission payment that created this deposit. Unique when present for exactly-once approval credit.';
comment on function private.driver_commission_unlinked_approved_total(uuid) is
  'Legacy approved commission payments without a linked deposit; prevents double-credit when new approvals are deposit-backed.';

notify pgrst, 'reload schema';

commit;
