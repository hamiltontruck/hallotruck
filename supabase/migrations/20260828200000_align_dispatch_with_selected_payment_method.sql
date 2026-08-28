-- Align dispatch eligibility with the simplified Customer-selected payment method.
-- Partner workflows and Partner finance are unchanged.

begin;

create or replace function public.order_payment_ready_for_dispatch(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.orders trip_order
    where trip_order.id = p_order_id
      and (
        trip_order.selected_payment_method = 'cash'
        or (
          trip_order.selected_payment_method = 'bank_telebirr'
          and coalesce(trip_order.price_etb, 0) > 0
          and coalesce((
            select sum(
              case
                when payment.event in ('held_escrow', 'released') then payment.amount_etb
                when payment.event = 'refunded' then -payment.amount_etb
                else 0
              end
            )
            from public.payments payment
            where payment.order_id = trip_order.id
              and lower(replace(btrim(coalesce(payment.provider, '')), ' ', '_'))
                not in ('cash', 'cash_to_driver', 'driver_cash')
          ), 0) + 0.005 >= coalesce(trip_order.price_etb, 0)
        )
      )
  );
$function$;

revoke all on function public.order_payment_ready_for_dispatch(uuid)
  from public, anon, authenticated;
grant execute on function public.order_payment_ready_for_dispatch(uuid)
  to authenticated, service_role;

create or replace function public.enforce_verified_payment_before_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requires_check boolean;
begin
  if tg_op = 'INSERT' then
    v_requires_check := new.driver_id is not null
      or new.truck_id is not null
      or new.status in (
        'accepted'::public.order_status,
        'in_transit'::public.order_status,
        'delivered'::public.order_status
      );
  else
    v_requires_check :=
      (old.driver_id is null and new.driver_id is not null)
      or (old.truck_id is null and new.truck_id is not null)
      or (
        old.status = 'placed'::public.order_status
        and new.status in (
          'accepted'::public.order_status,
          'in_transit'::public.order_status,
          'delivered'::public.order_status
        )
      );
  end if;

  if not v_requires_check then
    return new;
  end if;

  if new.selected_payment_method = 'cash' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Bank / Telebirr payment must be confirmed in full before dispatch';
  end if;

  if not public.order_payment_ready_for_dispatch(new.id) then
    raise exception 'Bank / Telebirr payment must be confirmed in full before dispatch';
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

commit;
