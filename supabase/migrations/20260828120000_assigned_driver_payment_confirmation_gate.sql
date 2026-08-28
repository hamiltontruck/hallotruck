begin;

create table if not exists public.driver_payment_confirmation_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  assigned_driver_id uuid not null references public.profiles(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  confirmation_type text not null check (confirmation_type in ('payment_confirmed', 'payment_not_received')),
  confirmed_amount_etb numeric(14, 2) not null check (confirmed_amount_etb >= 0),
  provider text not null,
  provider_ref text,
  reason text,
  confirmed_at timestamptz not null default now(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  constraint driver_payment_confirmation_actor_is_assignee check (actor_id = assigned_driver_id),
  constraint driver_payment_confirmation_reason_length check (reason is null or char_length(reason) between 3 and 500)
);

create unique index if not exists driver_payment_confirmation_events_once_idx
  on public.driver_payment_confirmation_events(payment_id, confirmation_type);
create index if not exists driver_payment_confirmation_events_order_idx
  on public.driver_payment_confirmation_events(order_id, confirmed_at desc);
create index if not exists driver_payment_confirmation_events_driver_idx
  on public.driver_payment_confirmation_events(assigned_driver_id, confirmed_at desc);

alter table public.driver_payment_confirmation_events enable row level security;
revoke all on table public.driver_payment_confirmation_events from public, anon, authenticated;
grant select on table public.driver_payment_confirmation_events to authenticated;
grant all on table public.driver_payment_confirmation_events to service_role;

drop policy if exists "driver payment confirmation leadership read" on public.driver_payment_confirmation_events;
create policy "driver payment confirmation leadership read"
on public.driver_payment_confirmation_events
for select
to authenticated
using ((select private.is_admin_or_ceo()));

create or replace function private.reject_driver_payment_confirmation_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Driver payment confirmation history is immutable';
end;
$function$;

revoke all on function private.reject_driver_payment_confirmation_event_mutation() from public, anon, authenticated;
grant execute on function private.reject_driver_payment_confirmation_event_mutation() to service_role;

drop trigger if exists reject_driver_payment_confirmation_event_mutation_trigger
  on public.driver_payment_confirmation_events;
create trigger reject_driver_payment_confirmation_event_mutation_trigger
before update or delete on public.driver_payment_confirmation_events
for each row execute function private.reject_driver_payment_confirmation_event_mutation();

insert into public.driver_payment_confirmation_events (
  order_id,
  assigned_driver_id,
  payment_id,
  confirmation_type,
  confirmed_amount_etb,
  provider,
  provider_ref,
  confirmed_at,
  actor_id
)
select
  confirmation.order_id,
  confirmation.driver_id,
  confirmation.payment_id,
  'payment_confirmed',
  payment.amount_etb,
  payment.provider,
  payment.provider_ref,
  confirmation.confirmed_at,
  confirmation.driver_id
from public.driver_payment_confirmations confirmation
join public.payments payment on payment.id = confirmation.payment_id
on conflict (payment_id, confirmation_type) do nothing;

-- Driver confirmation is an auditable gate. Delivery must never auto-release escrow.
drop trigger if exists release_confirmed_payments_after_delivery_trigger on public.orders;
drop function if exists public.release_confirmed_payments_after_delivery();

create or replace function public.recompute_order_payment_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total numeric;
  v_released numeric;
  v_held numeric;
  v_refunded numeric;
  v_net_released numeric;
  v_has_refund boolean;
begin
  select coalesce(price_etb, 0)
    into v_total
  from public.orders
  where id = p_order_id
  for update;

  if not found then return; end if;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded'), 0),
    exists(select 1 from public.payments p2 where p2.order_id = p_order_id and p2.event = 'refunded')
  into v_released, v_held, v_refunded, v_has_refund
  from public.payments
  where order_id = p_order_id;

  v_net_released := greatest(0, v_released - v_refunded);

  update public.orders
  set payment_status = case
    when v_total > 0 and v_net_released >= v_total then 'released'::public.payment_status
    when v_held > 0 or v_net_released > 0 then 'held_escrow'::public.payment_status
    when v_has_refund then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = p_order_id;
end;
$function$;

revoke all on function public.recompute_order_payment_status(uuid) from public, anon, authenticated;
grant execute on function public.recompute_order_payment_status(uuid) to service_role;

drop function if exists public.driver_payment_status(uuid);
create function public.driver_payment_status(p_order_id uuid)
returns table (
  payment_id uuid,
  provider text,
  provider_ref text,
  amount_etb numeric,
  payment_event text,
  confirmation_type text,
  confirmation_reason text,
  confirmed_at timestamptz,
  released_at timestamptz,
  order_status text,
  can_confirm boolean,
  can_report_not_received boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;

  if not exists (
    select 1
    from public.orders driver_order
    join public.profiles driver_profile on driver_profile.id = driver_order.driver_id
    where driver_order.id = p_order_id
      and driver_order.driver_id = v_driver_id
      and driver_profile.role::text = 'driver'
  ) then
    raise exception 'This order is not assigned to the signed-in driver';
  end if;

  return query
  select
    payment.id,
    payment.provider,
    payment.provider_ref,
    payment.amount_etb,
    payment.event::text,
    latest_event.confirmation_type,
    latest_event.reason,
    positive_event.confirmed_at,
    confirmation.released_at,
    driver_order.status::text,
    (
      driver_order.status = 'delivered'
      and payment.event = 'held_escrow'
      and positive_event.id is null
    ),
    (
      driver_order.status = 'delivered'
      and payment.event = 'held_escrow'
      and positive_event.id is null
      and negative_event.id is null
    )
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  left join public.driver_payment_confirmations confirmation on confirmation.payment_id = payment.id
  left join lateral (
    select event.id, event.confirmation_type, event.reason, event.confirmed_at
    from public.driver_payment_confirmation_events event
    where event.payment_id = payment.id
    order by event.confirmed_at desc, event.id desc
    limit 1
  ) latest_event on true
  left join lateral (
    select event.id, event.confirmed_at
    from public.driver_payment_confirmation_events event
    where event.payment_id = payment.id
      and event.confirmation_type = 'payment_confirmed'
    order by event.confirmed_at desc
    limit 1
  ) positive_event on true
  left join lateral (
    select event.id
    from public.driver_payment_confirmation_events event
    where event.payment_id = payment.id
      and event.confirmation_type = 'payment_not_received'
    order by event.confirmed_at desc
    limit 1
  ) negative_event on true
  where payment.order_id = p_order_id
    and payment.event in ('initiated', 'held_escrow', 'released')
  order by payment.created_at desc;
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
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_assigned_driver uuid;
  v_event public.payment_event;
  v_provider text;
  v_provider_ref text;
  v_amount numeric;
  v_order_status public.order_status;
begin
  if v_actor is null then raise exception 'Driver sign-in required'; end if;

  select payment.order_id, driver_order.driver_id, payment.event, payment.provider,
         payment.provider_ref, payment.amount_etb, driver_order.status
    into v_order_id, v_assigned_driver, v_event, v_provider,
         v_provider_ref, v_amount, v_order_status
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if v_assigned_driver is distinct from v_actor then
    raise exception 'Only the database-assigned driver can confirm this payment';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_actor and profile.role::text = 'driver'
  ) then
    raise exception 'Driver role required';
  end if;
  if v_order_status <> 'delivered' then
    raise exception 'Finish the trip before confirming payment';
  end if;
  if v_event <> 'held_escrow' then
    raise exception 'Only a Held Escrow payment can be confirmed';
  end if;
  if lower(btrim(coalesce(v_provider, ''))) in ('cash', 'cash_to_driver', 'driver_cash') then
    raise exception 'Cash received by the driver must use the cash collection workflow';
  end if;
  if exists (
    select 1 from public.driver_payment_confirmation_events event
    where event.payment_id = p_payment_id
      and event.confirmation_type = 'payment_confirmed'
  ) then
    raise exception 'This payment was already confirmed by the assigned driver';
  end if;

  begin
    insert into public.driver_payment_confirmation_events (
      order_id, assigned_driver_id, payment_id, confirmation_type,
      confirmed_amount_etb, provider, provider_ref, actor_id
    ) values (
      v_order_id, v_assigned_driver, p_payment_id, 'payment_confirmed',
      round(v_amount, 2), v_provider, v_provider_ref, v_actor
    );
  exception when unique_violation then
    raise exception 'This payment was already confirmed by the assigned driver';
  end;

  return 'confirmed_waiting_admin_release';
end;
$function$;

revoke all on function public.driver_confirm_verified_payment(uuid) from public, anon;
grant execute on function public.driver_confirm_verified_payment(uuid) to authenticated;

create or replace function public.driver_report_payment_not_received(
  p_payment_id uuid,
  p_reason text default 'Payment not received or could not be confirmed by the assigned driver'
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_assigned_driver uuid;
  v_event public.payment_event;
  v_provider text;
  v_provider_ref text;
  v_order_status public.order_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then raise exception 'Driver sign-in required'; end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Give a short reason for the unconfirmed payment';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Reason must be 500 characters or fewer';
  end if;

  select payment.order_id, driver_order.driver_id, payment.event, payment.provider,
         payment.provider_ref, driver_order.status
    into v_order_id, v_assigned_driver, v_event, v_provider,
         v_provider_ref, v_order_status
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if v_assigned_driver is distinct from v_actor then
    raise exception 'Only the database-assigned driver can report this payment';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_actor and profile.role::text = 'driver'
  ) then
    raise exception 'Driver role required';
  end if;
  if v_order_status <> 'delivered' then
    raise exception 'Finish the trip before reporting the payment status';
  end if;
  if v_event <> 'held_escrow' then
    raise exception 'Only a Held Escrow payment can be reported as not received';
  end if;
  if exists (
    select 1 from public.driver_payment_confirmation_events event
    where event.payment_id = p_payment_id
      and event.confirmation_type = 'payment_confirmed'
  ) then
    raise exception 'A confirmed payment cannot be changed to not received';
  end if;
  if exists (
    select 1 from public.driver_payment_confirmation_events event
    where event.payment_id = p_payment_id
      and event.confirmation_type = 'payment_not_received'
  ) then
    raise exception 'Payment not received was already reported for this payment';
  end if;

  begin
    insert into public.driver_payment_confirmation_events (
      order_id, assigned_driver_id, payment_id, confirmation_type,
      confirmed_amount_etb, provider, provider_ref, reason, actor_id
    ) values (
      v_order_id, v_assigned_driver, p_payment_id, 'payment_not_received',
      0, v_provider, v_provider_ref, v_reason, v_actor
    );
  exception when unique_violation then
    raise exception 'Payment not received was already reported for this payment';
  end;

  perform public.recompute_order_payment_status(v_order_id);
  return 'payment_not_received';
end;
$function$;

revoke all on function public.driver_report_payment_not_received(uuid, text) from public, anon;
grant execute on function public.driver_report_payment_not_received(uuid, text) to authenticated;

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
  v_refunded_total numeric;
begin
  select payment.order_id, driver_order.driver_id, payment.event,
         payment.amount_etb, payment.provider, driver_order.status, coalesce(driver_order.price_etb, 0)
    into v_order_id, v_driver_id, v_event, v_amount, v_provider, v_order_status, v_order_total
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then return false; end if;
  if v_event = 'released' then return true; end if;
  if v_event <> 'held_escrow' or v_order_status <> 'delivered' then return false; end if;
  if not exists (
    select 1 from public.driver_payment_confirmation_events event
    where event.payment_id = p_payment_id
      and event.order_id = v_order_id
      and event.assigned_driver_id = v_driver_id
      and event.actor_id = v_driver_id
      and event.confirmation_type = 'payment_confirmed'
  ) then return false; end if;

  select
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0),
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)
  into v_released_total, v_refunded_total
  from public.payments payment
  where payment.order_id = v_order_id;

  if v_released_total - v_refunded_total + v_amount > v_order_total + 0.005 then
    return false;
  end if;

  if lower(btrim(coalesce(v_provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash') then
    insert into public.driver_payment_confirmations(payment_id, order_id, driver_id, confirmed_at)
    select p_payment_id, v_order_id, v_driver_id, confirmation.confirmed_at
    from public.driver_payment_confirmation_events confirmation
    where confirmation.payment_id = p_payment_id
      and confirmation.confirmation_type = 'payment_confirmed'
    order by confirmation.confirmed_at
    limit 1
    on conflict (payment_id) do nothing;
  end if;

  update public.payments
  set event = 'released'
  where id = p_payment_id and event = 'held_escrow';
  if not found then return false; end if;

  update public.driver_payment_confirmations
  set released_at = coalesce(released_at, now())
  where payment_id = p_payment_id;

  perform public.recompute_order_payment_status(v_order_id);
  return true;
end;
$function$;

revoke all on function public.release_confirmed_driver_payment_internal(uuid) from public, anon, authenticated;
grant execute on function public.release_confirmed_driver_payment_internal(uuid) to service_role;

create or replace function public.admin_release_confirmed_driver_payment(p_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.payment_event;
  v_order_status public.order_status;
  v_has_confirmation boolean;
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  select payment.event, driver_order.status,
         exists (
           select 1 from public.driver_payment_confirmation_events confirmation
           where confirmation.payment_id = payment.id
             and confirmation.order_id = payment.order_id
             and confirmation.assigned_driver_id = driver_order.driver_id
             and confirmation.actor_id = driver_order.driver_id
             and confirmation.confirmation_type = 'payment_confirmed'
         )
    into v_event, v_order_status, v_has_confirmation
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id;

  if not found then raise exception 'Payment not found'; end if;
  if v_event = 'released' then return 'already_released'; end if;
  if v_order_status <> 'delivered' then
    raise exception 'Payment can only be released after the order is delivered';
  end if;
  if v_event <> 'held_escrow' then
    raise exception 'Only a Held Escrow payment can be released';
  end if;
  if not v_has_confirmation then
    raise exception 'Assigned driver confirmation is required before releasing this payment';
  end if;
  if not public.release_confirmed_driver_payment_internal(p_payment_id) then
    raise exception 'Payment release failed invoice or state validation';
  end if;

  return 'released';
end;
$function$;

revoke all on function public.admin_release_confirmed_driver_payment(uuid) from public, anon;
grant execute on function public.admin_release_confirmed_driver_payment(uuid) to authenticated;

-- Bank/mobile collection reports no longer require a Driver receipt upload.
create or replace function public.driver_submit_collected_payment(
  p_order_id uuid,
  p_collection_method text,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_receipt_path text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver_id uuid := auth.uid();
  v_order_driver uuid;
  v_order_status public.order_status;
  v_order_total numeric;
  v_tracking_id text;
  v_payment_terms text;
  v_method text := lower(btrim(coalesce(p_collection_method, '')));
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_provider_ref text := nullif(btrim(coalesce(p_provider_ref, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payment_id uuid;
  v_allowed_bank_providers constant text[] := array[
    'telebirr','cbe','awash_bank','bank_of_abyssinia','dashen_bank',
    'coop_bank_oromia','mpesa','other_bank'
  ];
begin
  if v_driver_id is null then raise exception 'Driver sign-in required'; end if;
  if not public.is_approved_driver() then raise exception 'Approved driver account required'; end if;

  select driver_order.driver_id, driver_order.status, coalesce(driver_order.price_etb, 0),
         driver_order.tracking_id, driver_order.payment_terms
    into v_order_driver, v_order_status, v_order_total, v_tracking_id, v_payment_terms
  from public.orders driver_order
  where driver_order.id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order_driver is distinct from v_driver_id then
    raise exception 'Only the database-assigned driver can report this payment';
  end if;
  if v_order_status <> 'delivered' then
    raise exception 'Payment collection can only be reported after delivery';
  end if;
  if v_order_total <= 0 then raise exception 'Order invoice total is invalid'; end if;
  if p_amount_etb is null or abs(p_amount_etb - v_order_total) > 0.005 then
    raise exception 'Report the full invoice amount of ETB %', v_order_total;
  end if;
  if v_method not in ('cash', 'bank') then
    raise exception 'Collection method must be cash or bank';
  end if;

  if v_method = 'cash' then
    v_provider := 'cash_to_driver';
    v_provider_ref := null;
    v_note := null;
  else
    if not (v_provider = any(v_allowed_bank_providers)) then
      raise exception 'Select a supported bank or mobile payment provider';
    end if;
    if v_provider_ref is null then
      raise exception 'Transaction ID is required for bank or mobile payment';
    end if;
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Collection note must be 500 characters or fewer';
  end if;

  if exists (
    select 1 from public.payments payment
    where payment.order_id = p_order_id
      and payment.event in ('initiated', 'held_escrow', 'released')
  ) then
    raise exception 'A payment is already submitted or verified for this order';
  end if;

  insert into public.payments(
    order_id, provider, provider_ref, amount_etb, event, receipt_path, raw_payload
  ) values (
    p_order_id, v_provider, v_provider_ref, v_order_total, 'initiated', null,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'driver_collection',
      'collection_method', v_method,
      'collected_by', v_driver_id,
      'direct_to_driver', true,
      'note', v_note,
      'tracking_id', v_tracking_id,
      'payment_terms', v_payment_terms
    ))
  ) returning id into v_payment_id;

  insert into public.driver_payment_confirmation_events (
    order_id, assigned_driver_id, payment_id, confirmation_type,
    confirmed_amount_etb, provider, provider_ref, actor_id
  ) values (
    p_order_id, v_driver_id, v_payment_id, 'payment_confirmed',
    round(v_order_total, 2), v_provider, v_provider_ref, v_driver_id
  );

  update public.orders
  set payment_provider = v_provider, payment_ref = v_provider_ref
  where id = p_order_id;

  return v_payment_id;
end;
$function$;

revoke all on function public.driver_submit_collected_payment(uuid, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.driver_submit_collected_payment(uuid, text, text, text, numeric, text, text) to authenticated;

-- Admin/CEO review accepts Driver bank reports without a Driver receipt.
-- Bank/mobile reports move to Held Escrow; cash-to-driver remains the existing direct-cash release flow.
create or replace function public.admin_review_customer_payment(
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
  v_event public.payment_event;
  v_order_id uuid;
  v_order_status public.order_status;
  v_order_total numeric;
  v_payment_amount numeric;
  v_source text;
  v_collection_method text;
  v_receipt_path text;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  v_driver_collection boolean;
  v_committed_excluding_current numeric;
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  select payment.event, payment.order_id, payment.amount_etb,
         coalesce(payment.raw_payload ->> 'source', ''),
         lower(coalesce(payment.raw_payload ->> 'collection_method', '')),
         payment.receipt_path,
         driver_order.status, coalesce(driver_order.price_etb, 0)
    into v_event, v_order_id, v_payment_amount, v_source,
         v_collection_method, v_receipt_path, v_order_status, v_order_total
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then raise exception 'Payment not found'; end if;
  if v_event <> 'initiated' then raise exception 'Only initiated payments can be reviewed'; end if;

  v_driver_collection := v_source = 'driver_collection';

  if p_approve then
    if v_driver_collection and v_order_status <> 'delivered' then
      raise exception 'Driver-reported payment can only be verified after delivery';
    end if;

    if not v_driver_collection
      and nullif(btrim(coalesce(v_receipt_path, '')), '') is null then
      raise exception 'Payment evidence is required before approval';
    end if;

    select coalesce(sum(
      case
        when payment.event in ('held_escrow', 'released') then payment.amount_etb
        when payment.event = 'refunded' then -payment.amount_etb
        else 0
      end
    ), 0)
    into v_committed_excluding_current
    from public.payments payment
    where payment.order_id = v_order_id
      and payment.id <> p_payment_id;

    if v_committed_excluding_current + v_payment_amount > v_order_total + 0.005 then
      raise exception 'Approval exceeds the remaining invoice balance by ETB %',
        round(v_committed_excluding_current + v_payment_amount - v_order_total, 2);
    end if;

    update public.payments
    set event = case
          when v_driver_collection and v_collection_method = 'cash'
            then 'released'::public.payment_event
          else 'held_escrow'::public.payment_event
        end,
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
    set event = 'failed', reviewed_by = v_actor, reviewed_at = now(), rejection_reason = v_reason
    where id = p_payment_id;

    update public.customer_dispatch_requests
    set status = 'expired', updated_at = now()
    where order_id = v_order_id and status = 'requested';
  end if;

  perform public.recompute_order_payment_status(v_order_id);
end;
$function$;

revoke all on function public.admin_review_customer_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_customer_payment(uuid, boolean, text) to authenticated;

-- Restore canonical statuses, including orders whose held escrow was previously mislabeled released.
do $block$
declare
  payment_order record;
begin
  for payment_order in select distinct order_id from public.payments loop
    perform public.recompute_order_payment_status(payment_order.order_id);
  end loop;
end;
$block$;

commit;
