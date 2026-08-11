-- Keep order workflow timestamps and payment summary states consistent.
-- Prevent Admin reassignment from moving completed/in-transit orders backwards.

-- Normalize stale historical state before adding the invariant.
update public.orders
set delivered_at = null
where status <> 'delivered'::public.order_status
  and delivered_at is not null;

alter table public.orders
  drop constraint if exists orders_delivery_state_consistent;
alter table public.orders
  add constraint orders_delivery_state_consistent
  check (
    (status = 'delivered'::public.order_status and delivered_at is not null)
    or
    (status <> 'delivered'::public.order_status and delivered_at is null)
  );

create or replace function public.admin_assign_order(
  p_order_id uuid,
  p_truck_id uuid,
  p_driver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_truck uuid;
  v_status public.order_status;
  v_delivered_at timestamptz;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select truck_id, status, delivered_at
    into v_old_truck, v_status, v_delivered_at
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_status not in ('placed'::public.order_status, 'accepted'::public.order_status)
     or v_delivered_at is not null then
    raise exception 'Only placed or accepted orders can be assigned or reassigned';
  end if;

  if not exists(
    select 1 from public.profiles
    where id = p_driver_id and role = 'driver'
  ) then
    raise exception 'Driver profile not found';
  end if;

  if not exists(
    select 1 from public.trucks
    where id = p_truck_id
      and (status = 'available' or id = v_old_truck)
    for update
  ) then
    raise exception 'Truck is not available';
  end if;

  if v_old_truck is not null and v_old_truck <> p_truck_id then
    update public.trucks
    set status = 'available', driver_id = null, updated_at = now()
    where id = v_old_truck;
  end if;

  update public.trucks
  set status = 'assigned', driver_id = p_driver_id, updated_at = now()
  where id = p_truck_id;

  update public.orders
  set truck_id = p_truck_id,
      driver_id = p_driver_id,
      status = 'accepted'::public.order_status,
      accepted_at = coalesce(accepted_at, now()),
      delivered_at = null
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_assign_order(uuid,uuid,uuid) from public, anon;
grant execute on function public.admin_assign_order(uuid,uuid,uuid) to authenticated;

create or replace function public.recompute_order_payment_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_released_gross numeric;
  v_credit_refunded numeric;
  v_released_net numeric;
  v_held numeric;
  v_has_refund boolean;
begin
  select coalesce(price_etb,0)
    into v_total
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return;
  end if;

  select
    coalesce(sum(amount_etb) filter (where event = 'released'),0),
    coalesce(sum(amount_etb) filter (where event = 'refunded' and provider = 'credit_refund'),0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'),0),
    exists(select 1 from public.payments p2 where p2.order_id = p_order_id and p2.event = 'refunded')
  into v_released_gross, v_credit_refunded, v_held, v_has_refund
  from public.payments
  where order_id = p_order_id;

  v_released_net := greatest(0, v_released_gross - v_credit_refunded);

  update public.orders
  set payment_status = case
    when v_total > 0 and v_released_net >= v_total then 'released'::public.payment_status
    when v_released_net > 0 or v_held > 0 then 'held_escrow'::public.payment_status
    when v_has_refund then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = p_order_id;
end;
$$;

create or replace function public.sync_order_payment_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  perform public.recompute_order_payment_status(v_order_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_order_payment_status on public.payments;
create trigger trg_sync_order_payment_status
after insert or update of event, amount_etb, order_id or delete on public.payments
for each row execute function public.sync_order_payment_status_trigger();

-- Recompute all existing order summaries from the payment ledger.
do $$
declare r record;
begin
  for r in select id from public.orders loop
    perform public.recompute_order_payment_status(r.id);
  end loop;
end $$;

revoke all on function public.recompute_order_payment_status(uuid) from public, anon;
notify pgrst, 'reload schema';
