create or replace function public.driver_payment_status(p_order_id uuid)
returns table(
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
as $$
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
    and p.event in ('held_escrow', 'released')
    and lower(btrim(coalesce(p.provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash')
  order by p.created_at desc;
end;
$$;

drop policy if exists "payments: participants read" on public.payments;
create policy "payments: participants read"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = payments.order_id
      and o.customer_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.orders o
    where o.id = payments.order_id
      and o.driver_id = (select auth.uid())
      and payments.event in ('held_escrow', 'released', 'refunded')
  )
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);
