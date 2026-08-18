begin;

create table if not exists public.driver_payment_confirmations (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  released_at timestamptz
);

create index if not exists driver_payment_confirmations_order_idx
  on public.driver_payment_confirmations(order_id, confirmed_at desc);
create index if not exists driver_payment_confirmations_driver_idx
  on public.driver_payment_confirmations(driver_id, confirmed_at desc);

alter table public.driver_payment_confirmations enable row level security;
revoke all on table public.driver_payment_confirmations from public, anon, authenticated;
grant all on table public.driver_payment_confirmations to service_role;

create or replace function public.release_confirmed_driver_payment_internal(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_driver_id uuid;
  v_event public.payment_event;
  v_amount numeric;
  v_provider text;
  v_order_status public.order_status;
  v_order_total numeric;
  v_released_total numeric;
  v_credit_refunded numeric;
begin
  select p.order_id, o.driver_id, p.event, p.amount_etb, p.provider, o.status, coalesce(o.price_etb, 0)
    into v_order_id, v_driver_id, v_event, v_amount, v_provider, v_order_status, v_order_total
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id
  for update of p, o;

  if not found then
    return false;
  end if;

  if v_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
    return true;
  end if;

  if v_event <> 'held_escrow' or v_order_status <> 'delivered' then
    return false;
  end if;

  if lower(btrim(coalesce(v_provider, ''))) in ('cash', 'cash_to_driver', 'driver_cash') then
    return false;
  end if;

  if not exists (
    select 1
    from public.driver_payment_confirmations c
    where c.payment_id = p_payment_id
      and c.order_id = v_order_id
      and c.driver_id = v_driver_id
  ) then
    return false;
  end if;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0)
  into v_released_total, v_credit_refunded
  from public.payments
  where order_id = v_order_id;

  if v_released_total - v_credit_refunded + v_amount > v_order_total then
    return false;
  end if;

  update public.payments
  set event = 'released'
  where id = p_payment_id
    and event = 'held_escrow';

  if not found then
    return false;
  end if;

  update public.driver_payment_confirmations
  set released_at = coalesce(released_at, now())
  where payment_id = p_payment_id;

  perform public.recompute_order_payment_status(v_order_id);
  return true;
end;
$function$;

revoke all on function public.release_confirmed_driver_payment_internal(uuid) from public, anon, authenticated;
grant execute on function public.release_confirmed_driver_payment_internal(uuid) to service_role;

create or replace function public.driver_payment_status(p_order_id uuid)
returns table (
  payment_id uuid,
  provider text,
  provider_ref text,
  amount_etb numeric,
  payment_event text,
  confirmed_at timestamptz,
  released_at timestamptz,
  order_status text,
  can_confirm boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception 'Sign in required';
  end if;

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.driver_id = v_driver_id
  ) then
    raise exception 'This order is not assigned to the signed-in driver';
  end if;

  return query
  select
    p.id,
    p.provider,
    p.provider_ref,
    p.amount_etb,
    p.event::text,
    c.confirmed_at,
    c.released_at,
    o.status::text,
    (p.event = 'held_escrow' and c.payment_id is null)
  from public.payments p
  join public.orders o on o.id = p.order_id
  left join public.driver_payment_confirmations c on c.payment_id = p.id
  where p.order_id = p_order_id
    and p.event in ('initiated', 'held_escrow', 'released')
    and lower(btrim(coalesce(p.provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash')
  order by p.created_at desc;
end;
$function$;

revoke all on function public.driver_payment_status(uuid) from public, anon;
grant execute on function public.driver_payment_status(uuid) to authenticated;

create or replace function public.driver_confirm_verified_payment(p_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver_id uuid := auth.uid();
  v_order_id uuid;
  v_assigned_driver uuid;
  v_event public.payment_event;
  v_provider text;
  v_order_status public.order_status;
  v_released boolean;
begin
  if v_driver_id is null then
    raise exception 'Sign in required';
  end if;

  select p.order_id, o.driver_id, p.event, p.provider, o.status
    into v_order_id, v_assigned_driver, v_event, v_provider, v_order_status
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id
  for update of p, o;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_assigned_driver is distinct from v_driver_id then
    raise exception 'Only the assigned driver can confirm this payment';
  end if;

  if lower(btrim(coalesce(v_provider, ''))) in ('cash', 'cash_to_driver', 'driver_cash') then
    raise exception 'Cash paid to the driver is handled through the commission wallet';
  end if;

  if v_event = 'initiated' then
    raise exception 'Admin or Finance must verify this payment first';
  end if;

  if v_event not in ('held_escrow', 'released') then
    raise exception 'This payment cannot be confirmed in its current state';
  end if;

  insert into public.driver_payment_confirmations(payment_id, order_id, driver_id)
  values (p_payment_id, v_order_id, v_driver_id)
  on conflict (payment_id) do nothing;

  if v_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
    return 'already_released';
  end if;

  v_released := public.release_confirmed_driver_payment_internal(p_payment_id);
  if v_released then
    return 'released';
  end if;

  if v_order_status = 'delivered' then
    raise exception 'Payment confirmation was saved, but release exceeds the invoice balance';
  end if;

  return 'confirmed_waiting_delivery';
end;
$function$;

revoke all on function public.driver_confirm_verified_payment(uuid) from public, anon;
grant execute on function public.driver_confirm_verified_payment(uuid) to authenticated;

create or replace function public.release_confirmed_payments_after_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment_id uuid;
begin
  if new.status = 'delivered' and old.status is distinct from new.status then
    for v_payment_id in
      select c.payment_id
      from public.driver_payment_confirmations c
      join public.payments p on p.id = c.payment_id
      where c.order_id = new.id
        and c.driver_id = new.driver_id
        and p.event = 'held_escrow'
      order by c.confirmed_at
    loop
      perform public.release_confirmed_driver_payment_internal(v_payment_id);
    end loop;
  end if;
  return new;
end;
$function$;

revoke all on function public.release_confirmed_payments_after_delivery() from public, anon, authenticated;
grant execute on function public.release_confirmed_payments_after_delivery() to service_role;

drop trigger if exists release_confirmed_payments_after_delivery_trigger on public.orders;
create trigger release_confirmed_payments_after_delivery_trigger
after update of status on public.orders
for each row
when (new.status = 'delivered' and old.status is distinct from new.status)
execute function public.release_confirmed_payments_after_delivery();

create or replace function public.admin_update_payment_event(p_payment_id uuid, p_event public.payment_event)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_current public.payment_event;
  v_amount numeric;
  v_provider text;
  v_driver_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_released_total numeric;
  v_credit_refunded numeric;
  v_held_total numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select p.order_id, p.event, p.amount_etb, p.provider, o.driver_id
    into v_order_id, v_current, v_amount, v_provider, v_driver_id
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id
  for update of p, o;

  if not found then
    raise exception 'Payment not found';
  end if;

  if not (
    (v_current = 'initiated' and p_event in ('held_escrow', 'failed')) or
    (v_current = 'held_escrow' and p_event in ('released', 'refunded')) or
    (v_current = 'released' and p_event = 'refunded') or
    v_current = p_event
  ) then
    raise exception 'Invalid payment transition: % to %', v_current, p_event;
  end if;

  select coalesce(price_etb, 0), status
    into v_order_total, v_order_status
  from public.orders
  where id = v_order_id
  for update;

  if p_event = 'released' and v_current <> 'released' then
    if v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;

    if lower(btrim(coalesce(v_provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash')
      and not exists (
        select 1 from public.driver_payment_confirmations c
        where c.payment_id = p_payment_id
          and c.order_id = v_order_id
          and c.driver_id = v_driver_id
      ) then
      raise exception 'Assigned driver confirmation is required before releasing this payment';
    end if;

    select
      coalesce(sum(amount_etb) filter (where event = 'released'), 0),
      coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0)
    into v_released_total, v_credit_refunded
    from public.payments
    where order_id = v_order_id;

    if v_released_total - v_credit_refunded + v_amount > v_order_total then
      raise exception 'Release exceeds invoice total by ETB %',
        (v_released_total - v_credit_refunded + v_amount - v_order_total);
    end if;
  end if;

  update public.payments
  set event = p_event
  where id = p_payment_id;

  if p_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
  end if;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0)
  into v_released_total, v_credit_refunded, v_held_total
  from public.payments
  where order_id = v_order_id;

  update public.orders
  set payment_status = case
    when v_released_total - v_credit_refunded >= v_order_total and v_order_total > 0 then 'released'::public.payment_status
    when v_released_total - v_credit_refunded > 0 or v_held_total > 0 then 'held_escrow'::public.payment_status
    when exists (
      select 1 from public.payments
      where order_id = v_order_id and event = 'refunded'
    ) then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = v_order_id;
end;
$function$;

create or replace function public.admin_record_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_event public.payment_event
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_released_total numeric;
  v_credit_refunded numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  if p_amount_etb <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select id
    into v_payment_id
  from public.payments
  where order_id = p_order_id
    and lower(provider) = lower(btrim(p_provider))
    and coalesce(provider_ref, '') = coalesce(nullif(btrim(p_provider_ref), ''), '')
    and amount_etb = p_amount_etb
    and event in ('initiated', 'held_escrow')
  order by created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    perform public.admin_update_payment_event(v_payment_id, p_event);
    return;
  end if;

  if nullif(btrim(p_provider_ref), '') is not null and exists (
    select 1 from public.payments
    where lower(btrim(provider)) = lower(btrim(p_provider))
      and lower(btrim(coalesce(provider_ref, ''))) = lower(btrim(p_provider_ref))
  ) then
    raise exception 'Transaction ID already exists for this provider: %', btrim(p_provider_ref);
  end if;

  if p_event = 'released'
    and lower(btrim(coalesce(p_provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash') then
    raise exception 'Non-cash payments must be verified by Admin and confirmed by the assigned driver before release';
  end if;

  if p_event = 'released' then
    select coalesce(price_etb, 0), status
      into v_order_total, v_order_status
    from public.orders
    where id = p_order_id
    for update;

    if not found then
      raise exception 'Order not found';
    end if;

    if v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;

    select
      coalesce(sum(amount_etb) filter (where event = 'released'), 0),
      coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'), 0)
    into v_released_total, v_credit_refunded
    from public.payments
    where order_id = p_order_id;

    if v_released_total - v_credit_refunded + p_amount_etb > v_order_total then
      raise exception 'Release exceeds invoice total by ETB %',
        (v_released_total - v_credit_refunded + p_amount_etb - v_order_total);
    end if;
  end if;

  insert into public.payments(order_id, provider, provider_ref, amount_etb, event)
  values (
    p_order_id,
    btrim(p_provider),
    nullif(btrim(p_provider_ref), ''),
    p_amount_etb,
    p_event
  );

  if p_event in ('held_escrow', 'released', 'refunded') then
    update public.orders
    set payment_provider = btrim(p_provider),
        payment_ref = nullif(btrim(p_provider_ref), ''),
        payment_status = case p_event
          when 'held_escrow' then 'held_escrow'::public.payment_status
          when 'released' then 'released'::public.payment_status
          when 'refunded' then 'refunded'::public.payment_status
          else payment_status
        end
    where id = p_order_id;
  end if;
end;
$function$;

commit;
