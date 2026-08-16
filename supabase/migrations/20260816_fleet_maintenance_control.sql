alter table public.trucks
  add column if not exists current_odometer_km numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trucks_current_odometer_nonnegative'
      and conrelid = 'public.trucks'::regclass
  ) then
    alter table public.trucks
      add constraint trucks_current_odometer_nonnegative
      check (current_odometer_km is null or current_odometer_km >= 0);
  end if;
end $$;

create table if not exists public.truck_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete cascade,
  maintenance_type text not null,
  status text not null default 'completed',
  service_date date not null default current_date,
  odometer_km numeric,
  cost_etb numeric not null default 0,
  vendor text,
  notes text,
  next_service_date date,
  next_service_odometer_km numeric,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truck_maintenance_type_check check (
    maintenance_type in ('scheduled_service','oil_change','tyres','repair','inspection','insurance','permit','other')
  ),
  constraint truck_maintenance_status_check check (
    status in ('scheduled','in_progress','completed','cancelled')
  ),
  constraint truck_maintenance_odometer_check check (odometer_km is null or odometer_km >= 0),
  constraint truck_maintenance_cost_check check (cost_etb >= 0),
  constraint truck_maintenance_next_odometer_check check (
    next_service_odometer_km is null or next_service_odometer_km >= 0
  )
);

create index if not exists truck_maintenance_truck_date_idx
  on public.truck_maintenance_records(truck_id, service_date desc, created_at desc);
create index if not exists truck_maintenance_status_date_idx
  on public.truck_maintenance_records(status, service_date);
create index if not exists truck_maintenance_next_service_idx
  on public.truck_maintenance_records(next_service_date)
  where next_service_date is not null and status <> 'cancelled';

alter table public.truck_maintenance_records enable row level security;

drop policy if exists "fleet maintenance leadership read" on public.truck_maintenance_records;
create policy "fleet maintenance leadership read"
on public.truck_maintenance_records
for select
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

drop policy if exists "fleet maintenance leadership insert" on public.truck_maintenance_records;
create policy "fleet maintenance leadership insert"
on public.truck_maintenance_records
for insert
to authenticated
with check (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

drop policy if exists "fleet maintenance leadership update" on public.truck_maintenance_records;
create policy "fleet maintenance leadership update"
on public.truck_maintenance_records
for update
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
)
with check (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

create or replace function public.touch_truck_maintenance_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists truck_maintenance_touch_updated_at on public.truck_maintenance_records;
create trigger truck_maintenance_touch_updated_at
before update on public.truck_maintenance_records
for each row
execute function public.touch_truck_maintenance_record();

create or replace function public.sync_truck_odometer_from_maintenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.odometer_km is not null then
    update public.trucks
    set
      current_odometer_km = greatest(coalesce(current_odometer_km, 0), new.odometer_km),
      updated_at = now()
    where id = new.truck_id;
  end if;
  return new;
end;
$$;

drop trigger if exists truck_maintenance_sync_odometer on public.truck_maintenance_records;
create trigger truck_maintenance_sync_odometer
after insert or update of status, odometer_km on public.truck_maintenance_records
for each row
execute function public.sync_truck_odometer_from_maintenance();

create or replace function public.admin_set_truck_operational_status(
  p_truck_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
begin
  if v_role not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  if p_status not in ('available', 'maintenance', 'out_of_service') then
    raise exception 'Invalid truck operational status';
  end if;

  if exists (
    select 1
    from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Truck has an active trip and cannot change operational status';
  end if;

  update public.trucks
  set status = p_status, driver_id = null, updated_at = now()
  where id = p_truck_id;

  if not found then
    raise exception 'Truck not found';
  end if;
end;
$$;

revoke all on function public.admin_set_truck_operational_status(uuid, text) from public, anon;
grant execute on function public.admin_set_truck_operational_status(uuid, text) to authenticated;

grant select, insert, update on public.truck_maintenance_records to authenticated;

notify pgrst, 'reload schema';
