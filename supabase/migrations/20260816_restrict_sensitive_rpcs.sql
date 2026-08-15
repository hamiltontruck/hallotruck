create or replace function public.driver_commission_balance(p_driver_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    ''
  );
  v_balance numeric;
begin
  if v_uid is null and v_role <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if p_driver_id is distinct from v_uid
     and v_role not in ('admin', 'ceo', 'service_role') then
    raise exception 'You can only view your own commission balance';
  end if;

  select greatest(
    0,
    coalesce((
      select sum(c.commission_etb)
      from public.driver_commission_charges c
      where c.driver_id = p_driver_id
        and c.status = 'active'
    ), 0)
    - coalesce((
      select sum(p.amount_etb)
      from public.driver_commission_payments p
      where p.driver_id = p_driver_id
        and p.status = 'approved'
    ), 0)
  )
  into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.driver_commission_balance(uuid) from public, anon;
grant execute on function public.driver_commission_balance(uuid) to authenticated, service_role;

create or replace function public.get_available_jobs()
returns table(
  id uuid,
  tracking_id text,
  pickup_address text,
  dropoff_address text,
  vehicle_type text,
  distance_km numeric,
  price_etb numeric,
  cargo_description text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Approved driver account required';
  end if;

  return query
  select
    o.id,
    o.tracking_id,
    o.pickup_address,
    o.dropoff_address,
    o.vehicle_type,
    o.distance_km,
    o.price_etb,
    o.cargo_description
  from public.orders o
  where o.status = 'placed'::public.order_status
    and o.driver_id is null
  order by o.created_at asc;
end;
$$;

revoke all on function public.get_available_jobs() from public, anon;
grant execute on function public.get_available_jobs() to authenticated;

revoke all on function public.recompute_order_payment_status(uuid)
from public, anon, authenticated;
grant execute on function public.recompute_order_payment_status(uuid)
to service_role;

notify pgrst, 'reload schema';
