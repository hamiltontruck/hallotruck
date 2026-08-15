alter table public.orders
  add column if not exists cargo_quantity numeric(12,2),
  add column if not exists cargo_unit text,
  add column if not exists cargo_weight_tons numeric(12,3)
    generated always as (
      case
        when cargo_quantity is null or cargo_unit is null then null
        when cargo_unit = 'quintal' then cargo_quantity / 10
        else cargo_quantity
      end
    ) stored;

alter table public.orders
  drop constraint if exists orders_cargo_quantity_unit_check;

alter table public.orders
  add constraint orders_cargo_quantity_unit_check
  check (
    (cargo_quantity is null and cargo_unit is null)
    or
    (cargo_quantity > 0 and cargo_unit in ('ton', 'quintal'))
  );

create or replace function public.enforce_order_truck_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity numeric;
  v_weight_tons numeric;
begin
  if new.truck_id is null or new.cargo_quantity is null or new.cargo_unit is null then
    return new;
  end if;

  v_weight_tons := case
    when new.cargo_unit = 'quintal' then new.cargo_quantity / 10
    else new.cargo_quantity
  end;

  select t.capacity_tons
  into v_capacity
  from public.trucks t
  where t.id = new.truck_id;

  if v_capacity is not null and v_weight_tons > v_capacity then
    raise exception 'Cargo load of % tons exceeds truck capacity of % tons', v_weight_tons, v_capacity;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_enforce_truck_capacity on public.orders;
create trigger orders_enforce_truck_capacity
before insert or update of truck_id, cargo_quantity, cargo_unit
on public.orders
for each row
execute function public.enforce_order_truck_capacity();

revoke all on function public.enforce_order_truck_capacity() from public, anon, authenticated;

grant select (cargo_quantity, cargo_unit, cargo_weight_tons) on public.orders to authenticated;

notify pgrst, 'reload schema';
