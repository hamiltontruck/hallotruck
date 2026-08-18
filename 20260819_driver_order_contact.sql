begin;

create or replace function public.driver_order_contact(p_order_id uuid)
returns table (
  customer_name text,
  customer_phone text
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

  return query
  select
    coalesce(nullif(btrim(o.customer_name), ''), 'Customer'),
    nullif(btrim(o.customer_phone), '')
  from public.orders o
  where o.id = p_order_id
    and o.driver_id = v_driver_id
    and o.status in ('accepted', 'in_transit', 'delivered');

  if not found then
    raise exception 'Customer contact is available only to the assigned driver';
  end if;
end;
$function$;

revoke all on function public.driver_order_contact(uuid) from public, anon;
grant execute on function public.driver_order_contact(uuid) to authenticated;

commit;
