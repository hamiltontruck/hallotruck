begin;

create or replace function public.get_latest_tracking_point(p_order_id uuid)
returns table(
  id bigint,
  location public.geography,
  heading numeric,
  speed_kmh numeric,
  accuracy_m numeric,
  source_recorded_at timestamptz,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_customer_id uuid;
  v_driver_id uuid;
  v_profile_role text;
  v_driver_status text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select o.customer_id, o.driver_id
  into v_customer_id, v_driver_id
  from public.orders o
  where o.id = p_order_id;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select p.role::text, p.driver_status::text
  into v_profile_role, v_driver_status
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Active profile required' using errcode = '42501';
  end if;

  if v_actor = v_customer_id then
    if v_profile_role <> 'customer' then
      raise exception 'Customer profile required for this order' using errcode = '42501';
    end if;
  elsif v_actor = v_driver_id then
    if v_profile_role <> 'driver'
       or coalesce(v_driver_status, '') in ('suspended', 'rejected') then
      raise exception 'Active assigned Driver profile required' using errcode = '42501';
    end if;
  elsif not private.is_admin_or_ceo() then
    raise exception 'Not authorized for this order' using errcode = '42501';
  end if;

  return query
  select
    tp.id,
    tp.location,
    tp.heading,
    tp.speed_kmh,
    tp.accuracy_m,
    tp.source_recorded_at,
    tp.recorded_at
  from public.tracking_pings tp
  where tp.order_id = p_order_id
  order by tp.recorded_at desc
  limit 1;
end;
$$;

revoke all on function public.get_latest_tracking_point(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_latest_tracking_point(uuid)
  to authenticated;

commit;
