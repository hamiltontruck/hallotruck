begin;

alter table public.driver_payment_confirmations
  add column if not exists gross_etb numeric(14,2),
  add column if not exists commission_percent numeric(5,2) not null default 2.00,
  add column if not exists commission_etb numeric(14,2),
  add column if not exists driver_net_etb numeric(14,2),
  add column if not exists commission_accrued_at timestamptz,
  add column if not exists commission_reversed_at timestamptz;

create or replace function public.populate_driver_payment_confirmation_financials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_amount numeric;
  v_provider text;
begin
  select p.amount_etb, p.provider
    into v_amount, v_provider
  from public.payments p
  where p.id = new.payment_id;

  if not found then
    raise exception 'Payment not found for driver confirmation';
  end if;

  if lower(btrim(coalesce(v_provider, ''))) in ('cash', 'cash_to_driver', 'driver_cash') then
    raise exception 'Cash paid to a driver belongs to the driver commission wallet flow';
  end if;

  new.gross_etb := round(coalesce(v_amount, 0), 2);
  new.commission_percent := 2.00;
  new.commission_etb := round(coalesce(v_amount, 0) * 0.02, 2);
  new.driver_net_etb := round(coalesce(v_amount, 0) - (coalesce(v_amount, 0) * 0.02), 2);
  new.commission_accrued_at := coalesce(new.commission_accrued_at, new.confirmed_at, now());
  return new;
end;
$function$;

revoke all on function public.populate_driver_payment_confirmation_financials() from public, anon, authenticated;
grant execute on function public.populate_driver_payment_confirmation_financials() to service_role;

drop trigger if exists populate_driver_payment_confirmation_financials_trigger
  on public.driver_payment_confirmations;
create trigger populate_driver_payment_confirmation_financials_trigger
before insert or update of payment_id
on public.driver_payment_confirmations
for each row
execute function public.populate_driver_payment_confirmation_financials();

update public.driver_payment_confirmations c
set gross_etb = round(p.amount_etb, 2),
    commission_percent = 2.00,
    commission_etb = round(p.amount_etb * 0.02, 2),
    driver_net_etb = round(p.amount_etb - (p.amount_etb * 0.02), 2),
    commission_accrued_at = coalesce(c.commission_accrued_at, c.confirmed_at)
from public.payments p
where p.id = c.payment_id;

alter table public.driver_payment_confirmations
  alter column gross_etb set not null,
  alter column commission_etb set not null,
  alter column driver_net_etb set not null,
  alter column commission_accrued_at set not null;

create or replace function public.sync_platform_commission_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.event = 'refunded' and old.event is distinct from new.event then
    update public.driver_payment_confirmations
    set commission_reversed_at = coalesce(commission_reversed_at, now())
    where payment_id = new.id;
  elsif new.event = 'released' and old.event is distinct from new.event then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = new.id;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_platform_commission_payment_state() from public, anon, authenticated;
grant execute on function public.sync_platform_commission_payment_state() to service_role;

drop trigger if exists sync_platform_commission_payment_state_trigger on public.payments;
create trigger sync_platform_commission_payment_state_trigger
after update of event on public.payments
for each row
when (old.event is distinct from new.event)
execute function public.sync_platform_commission_payment_state();

create or replace function public.admin_platform_commission_accruals()
returns table (
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
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  return query
  select
    c.payment_id,
    c.order_id,
    o.tracking_id,
    c.driver_id,
    pr.full_name,
    p.provider,
    p.provider_ref,
    c.gross_etb,
    c.commission_percent,
    c.commission_etb,
    c.driver_net_etb,
    c.confirmed_at,
    c.released_at,
    c.commission_accrued_at,
    c.commission_reversed_at,
    case
      when c.commission_reversed_at is not null then 'reversed'
      when c.released_at is not null then 'released'
      else 'accrued'
    end::text
  from public.driver_payment_confirmations c
  join public.payments p on p.id = c.payment_id
  join public.orders o on o.id = c.order_id
  left join public.profiles pr on pr.id = c.driver_id
  order by c.confirmed_at desc;
end;
$function$;

revoke all on function public.admin_platform_commission_accruals() from public, anon;
grant execute on function public.admin_platform_commission_accruals() to authenticated;

commit;
