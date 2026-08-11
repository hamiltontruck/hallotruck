create or replace function public.customer_get_live_trip(p_order_id uuid)
returns table(
  order_id uuid,
  status public.order_status,
  pickup_lng double precision,
  pickup_lat double precision,
  dropoff_lng double precision,
  dropoff_lat double precision,
  truck_lng double precision,
  truck_lat double precision,
  heading numeric,
  speed_kmh numeric,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        o.customer_id = auth.uid()
        or o.driver_id = auth.uid()
        or jwt_role in ('admin', 'ceo')
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin','ceo')
        )
      )
  ) then
    raise exception 'Order not found or access denied';
  end if;

  return query
  select
    o.id,
    o.status,
    st_x(o.pickup::geometry),
    st_y(o.pickup::geometry),
    st_x(o.dropoff::geometry),
    st_y(o.dropoff::geometry),
    st_x(tp.location::geometry),
    st_y(tp.location::geometry),
    tp.heading,
    tp.speed_kmh,
    tp.recorded_at
  from public.orders o
  left join lateral (
    select t.location, t.heading, t.speed_kmh, t.recorded_at
    from public.tracking_pings t
    where t.order_id = o.id
    order by t.recorded_at desc
    limit 1
  ) tp on true
  where o.id = p_order_id;
end;
$$;

revoke all on function public.customer_get_live_trip(uuid) from public, anon;
grant execute on function public.customer_get_live_trip(uuid) to authenticated;
notify pgrst, 'reload schema';