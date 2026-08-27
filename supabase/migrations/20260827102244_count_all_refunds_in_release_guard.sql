create or replace function public.release_confirmed_driver_payment_internal(
  p_payment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
         payment.amount_etb, payment.provider, driver_order.status,
         coalesce(driver_order.price_etb, 0)
  into v_order_id, v_driver_id, v_event, v_amount, v_provider,
       v_order_status, v_order_total
  from public.payments payment
  join public.orders driver_order on driver_order.id = payment.order_id
  where payment.id = p_payment_id
  for update of payment, driver_order;

  if not found then return false; end if;

  if v_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
    return true;
  end if;

  if v_event <> 'held_escrow' or v_order_status <> 'delivered' then return false; end if;
  if lower(btrim(coalesce(v_provider, ''))) in ('cash', 'cash_to_driver', 'driver_cash') then
    return false;
  end if;
  if not exists (
    select 1
    from public.driver_payment_confirmations confirmation
    where confirmation.payment_id = p_payment_id
      and confirmation.order_id = v_order_id
      and confirmation.driver_id = v_driver_id
  ) then return false; end if;

  select
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'released'), 0),
    coalesce(sum(payment.amount_etb) filter (where payment.event = 'refunded'), 0)
  into v_released_total, v_refunded_total
  from public.payments payment
  where payment.order_id = v_order_id;

  if v_released_total - v_refunded_total + v_amount > v_order_total then
    return false;
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
$$;

revoke all on function public.release_confirmed_driver_payment_internal(uuid)
  from public, anon, authenticated;
