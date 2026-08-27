-- Phase 4: enterprise fleet profiles, availability, expiry, maintenance and audit.
-- Existing truck, Partner Wallet and GPS history remain in place.

create schema if not exists private;

create or replace function private.normalize_fleet_plate(p_plate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_plate, '')), '[^A-Za-z0-9]+', '', 'g'));
$$;

revoke all on function private.normalize_fleet_plate(text) from public, anon, authenticated;

create or replace function private.can_manage_partner_fleet(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin_or_ceo())
    or exists (
      select 1
      from public.partner_memberships membership
      join public.partner_organizations organization
        on organization.id = membership.partner_id
      where membership.partner_id = p_partner_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.member_role in ('owner', 'admin')
        and organization.status = 'active'
    );
$$;

revoke all on function private.can_manage_partner_fleet(uuid) from public, anon, authenticated;

create table public.fleet_branches (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partner_organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9_-]{2,30}$'),
  address text check (address is null or char_length(btrim(address)) between 2 and 300),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index fleet_branches_scope_code_key
  on public.fleet_branches(coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code));
create index fleet_branches_partner_active_idx
  on public.fleet_branches(partner_id, active, name);

alter table public.trucks
  add column if not exists plate_key text generated always as (
    upper(regexp_replace(btrim(plate_number), '[^A-Za-z0-9]+', '', 'g'))
  ) stored,
  add column if not exists ownership_type text not null default 'company',
  add column if not exists fuel_type text,
  add column if not exists branch_id uuid,
  add column if not exists partner_id uuid,
  add column if not exists insurance_expiry date,
  add column if not exists license_expiry date,
  add column if not exists roadworthiness_expiry date,
  add column if not exists last_service_date date,
  add column if not exists next_service_date date,
  add column if not exists maintenance_status text not null default 'clear',
  add column if not exists gps_provider text,
  add column if not exists gps_external_id text;

alter table public.partner_fleet_vehicles
  add column if not exists plate_key text generated always as (
    upper(regexp_replace(btrim(plate_number), '[^A-Za-z0-9]+', '', 'g'))
  ) stored,
  add column if not exists truck_id uuid,
  add column if not exists ownership_type text not null default 'partner',
  add column if not exists fuel_type text,
  add column if not exists branch_id uuid,
  add column if not exists assigned_driver_id uuid,
  add column if not exists current_odometer_km numeric,
  add column if not exists insurance_expiry date,
  add column if not exists license_expiry date,
  add column if not exists roadworthiness_expiry date,
  add column if not exists last_service_date date,
  add column if not exists next_service_date date,
  add column if not exists maintenance_status text not null default 'clear';

update public.trucks set status = 'suspended' where status = 'out_of_service';
update public.partner_fleet_vehicles set status = 'suspended' where status = 'out_of_service';

alter table public.trucks drop constraint if exists trucks_status_check;
alter table public.partner_fleet_vehicles drop constraint if exists partner_fleet_vehicles_status_check;

alter table public.trucks
  add constraint trucks_enterprise_status_check check (
    status in ('available', 'assigned', 'on_trip', 'maintenance', 'suspended', 'inactive')
  ),
  add constraint trucks_ownership_type_check check (
    ownership_type in ('company', 'leased', 'owner_operator', 'partner')
  ),
  add constraint trucks_fuel_type_check check (
    fuel_type is null or fuel_type in ('diesel', 'petrol', 'electric', 'hybrid', 'cng', 'other')
  ),
  add constraint trucks_maintenance_status_check check (
    maintenance_status in ('clear', 'scheduled', 'in_progress', 'overdue')
  ),
  add constraint trucks_plate_key_not_blank check (char_length(plate_key) between 3 and 30),
  add constraint trucks_capacity_positive check (capacity_tons is null or capacity_tons > 0),
  add constraint trucks_gps_provider_length check (
    gps_provider is null or char_length(btrim(gps_provider)) between 2 and 80
  ),
  add constraint trucks_gps_external_id_length check (
    gps_external_id is null or char_length(btrim(gps_external_id)) between 2 and 160
  );

alter table public.partner_fleet_vehicles
  add constraint partner_fleet_enterprise_status_check check (
    status in ('available', 'assigned', 'on_trip', 'maintenance', 'suspended', 'inactive')
  ),
  add constraint partner_fleet_ownership_type_check check (
    ownership_type in ('partner', 'leased', 'owner_operator')
  ),
  add constraint partner_fleet_fuel_type_check check (
    fuel_type is null or fuel_type in ('diesel', 'petrol', 'electric', 'hybrid', 'cng', 'other')
  ),
  add constraint partner_fleet_maintenance_status_check check (
    maintenance_status in ('clear', 'scheduled', 'in_progress', 'overdue')
  ),
  add constraint partner_fleet_plate_key_not_blank check (char_length(plate_key) between 3 and 30),
  add constraint partner_fleet_capacity_positive check (capacity_tons is null or capacity_tons > 0),
  add constraint partner_fleet_odometer_nonnegative check (
    current_odometer_km is null or current_odometer_km >= 0
  );

do $$
begin
  if exists (
    select 1 from public.trucks truck
    where truck.plate_key is null or char_length(truck.plate_key) not between 3 and 30
  ) or exists (
    select 1 from public.partner_fleet_vehicles vehicle
    where vehicle.plate_key is null or char_length(vehicle.plate_key) not between 3 and 30
  ) then
    raise exception 'Existing fleet contains an invalid plate number; correct it before migration';
  end if;

  if exists (
    select truck.plate_key from public.trucks truck
    group by truck.plate_key having count(*) > 1
  ) or exists (
    select vehicle.plate_key from public.partner_fleet_vehicles vehicle
    group by vehicle.plate_key having count(*) > 1
  ) or exists (
    select 1
    from public.trucks truck
    join public.partner_fleet_vehicles vehicle on vehicle.plate_key = truck.plate_key
    where vehicle.truck_id is null or vehicle.truck_id <> truck.id
  ) then
    raise exception 'Existing fleet contains duplicate normalized plate numbers; correct them before migration';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trucks_branch_id_fkey' and conrelid = 'public.trucks'::regclass
  ) then
    alter table public.trucks add constraint trucks_branch_id_fkey
      foreign key (branch_id) references public.fleet_branches(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'trucks_partner_id_fkey' and conrelid = 'public.trucks'::regclass
  ) then
    alter table public.trucks add constraint trucks_partner_id_fkey
      foreign key (partner_id) references public.partner_organizations(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_fleet_truck_id_fkey'
      and conrelid = 'public.partner_fleet_vehicles'::regclass
  ) then
    alter table public.partner_fleet_vehicles add constraint partner_fleet_truck_id_fkey
      foreign key (truck_id) references public.trucks(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_fleet_branch_id_fkey'
      and conrelid = 'public.partner_fleet_vehicles'::regclass
  ) then
    alter table public.partner_fleet_vehicles add constraint partner_fleet_branch_id_fkey
      foreign key (branch_id) references public.fleet_branches(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_fleet_assigned_driver_id_fkey'
      and conrelid = 'public.partner_fleet_vehicles'::regclass
  ) then
    alter table public.partner_fleet_vehicles add constraint partner_fleet_assigned_driver_id_fkey
      foreign key (assigned_driver_id) references public.profiles(id) on delete set null;
  end if;
end $$;

create unique index if not exists trucks_plate_key_unique on public.trucks(plate_key);
create unique index if not exists partner_fleet_plate_key_unique on public.partner_fleet_vehicles(plate_key);
create unique index if not exists partner_fleet_truck_key
  on public.partner_fleet_vehicles(truck_id) where truck_id is not null;
create index trucks_partner_status_idx on public.trucks(partner_id, status, updated_at desc);
create index trucks_branch_status_idx on public.trucks(branch_id, status, updated_at desc)
  where branch_id is not null;
create index trucks_driver_status_idx on public.trucks(driver_id, status)
  where driver_id is not null;
create index trucks_expiry_idx
  on public.trucks(insurance_expiry, license_expiry, roadworthiness_expiry);
create index trucks_next_service_idx on public.trucks(next_service_date)
  where next_service_date is not null;
create index partner_fleet_branch_status_idx
  on public.partner_fleet_vehicles(partner_id, branch_id, status);
create index partner_fleet_expiry_idx
  on public.partner_fleet_vehicles(partner_id, insurance_expiry, license_expiry, roadworthiness_expiry);

create table public.fleet_audit_events (
  id bigint generated always as identity primary key,
  entity_type text not null check (
    entity_type in ('truck', 'partner_vehicle', 'maintenance', 'branch')
  ),
  entity_id uuid not null,
  truck_id uuid references public.trucks(id) on delete restrict,
  partner_vehicle_id uuid references public.partner_fleet_vehicles(id) on delete restrict,
  partner_id uuid references public.partner_organizations(id) on delete restrict,
  subject_driver_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (
    event_type in (
      'created', 'profile_updated', 'status_changed', 'driver_assigned',
      'driver_unassigned', 'maintenance_created', 'maintenance_status_changed'
    )
  ),
  reason text check (reason is null or char_length(btrim(reason)) between 2 and 500),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  source text not null default 'system' check (source in ('admin', 'partner', 'driver', 'system')),
  created_at timestamptz not null default now(),
  check (
    (entity_type = 'truck' and truck_id = entity_id)
    or (entity_type = 'partner_vehicle' and partner_vehicle_id = entity_id)
    or entity_type in ('maintenance', 'branch')
  )
);

create index fleet_audit_truck_created_idx
  on public.fleet_audit_events(truck_id, created_at desc) where truck_id is not null;
create index fleet_audit_partner_created_idx
  on public.fleet_audit_events(partner_id, created_at desc) where partner_id is not null;
create index fleet_audit_driver_created_idx
  on public.fleet_audit_events(subject_driver_id, created_at desc)
  where subject_driver_id is not null;
create index fleet_audit_entity_created_idx
  on public.fleet_audit_events(entity_type, entity_id, created_at desc);

alter table public.fleet_branches enable row level security;
alter table public.fleet_audit_events enable row level security;

drop policy if exists "trucks admin manage" on public.trucks;
drop policy if exists "trucks driver reads assigned" on public.trucks;
create policy trucks_leadership_read on public.trucks
for select to authenticated
using ((select private.is_admin_or_ceo()));
create policy trucks_driver_read on public.trucks
for select to authenticated
using (
  driver_id = (select auth.uid())
  or exists (
    select 1 from public.orders active_order
    where active_order.truck_id = trucks.id
      and active_order.driver_id = (select auth.uid())
  )
);
create policy trucks_partner_read on public.trucks
for select to authenticated
using (partner_id is not null and (select private.is_partner_member(partner_id)));

drop policy if exists "fleet maintenance leadership read" on public.truck_maintenance_records;
drop policy if exists "fleet maintenance leadership insert" on public.truck_maintenance_records;
drop policy if exists "fleet maintenance leadership update" on public.truck_maintenance_records;
create policy fleet_maintenance_authorized_read on public.truck_maintenance_records
for select to authenticated
using (
  (select private.is_admin_or_ceo())
  or exists (
    select 1 from public.trucks truck
    where truck.id = truck_maintenance_records.truck_id
      and truck.partner_id is not null
      and (select private.is_partner_member(truck.partner_id))
  )
);

drop policy if exists partner_fleet_admin_insert on public.partner_fleet_vehicles;
drop policy if exists partner_fleet_admin_update on public.partner_fleet_vehicles;

create policy fleet_branches_authorized_read on public.fleet_branches
for select to authenticated
using (
  (select private.is_admin_or_ceo())
  or (partner_id is not null and (select private.is_partner_member(partner_id)))
);

create policy fleet_audit_authorized_read on public.fleet_audit_events
for select to authenticated
using (
  (select private.is_admin_or_ceo())
  or (partner_id is not null and (select private.is_partner_member(partner_id)))
  or subject_driver_id = (select auth.uid())
);

revoke all on table public.trucks from public, anon, authenticated;
revoke all on table public.truck_maintenance_records from public, anon, authenticated;
revoke all on table public.partner_fleet_vehicles from public, anon, authenticated;
revoke all on table public.fleet_branches from public, anon, authenticated;
revoke all on table public.fleet_audit_events from public, anon, authenticated;
grant select on table public.trucks to authenticated;
grant select on table public.truck_maintenance_records to authenticated;
grant select on table public.partner_fleet_vehicles to authenticated;
grant select on table public.fleet_branches to authenticated;
grant select on table public.fleet_audit_events to authenticated;
grant all on table public.trucks, public.truck_maintenance_records,
  public.partner_fleet_vehicles, public.fleet_branches, public.fleet_audit_events
  to service_role;
revoke all on sequence public.fleet_audit_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.fleet_audit_events_id_seq to service_role;

create or replace function private.reject_fleet_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Fleet audit history is immutable' using errcode = '55000';
end;
$$;

revoke all on function private.reject_fleet_audit_mutation() from public, anon, authenticated;
create trigger fleet_audit_events_immutable
before update or delete on public.fleet_audit_events
for each row execute function private.reject_fleet_audit_mutation();

create or replace function private.guard_fleet_plate_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := private.normalize_fleet_plate(new.plate_number);
  v_truck public.trucks%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));
  if char_length(v_key) not between 3 and 30 then
    raise exception 'Plate number must contain 3 to 30 letters or digits';
  end if;

  if tg_table_name = 'trucks' then
    if exists (
      select 1 from public.partner_fleet_vehicles vehicle
      where vehicle.plate_key = v_key
        and (vehicle.truck_id is null or vehicle.truck_id <> new.id)
    ) then raise exception 'Plate number already exists in Partner fleet'; end if;
  else
    if new.truck_id is not null then
      select * into v_truck from public.trucks where id = new.truck_id;
      if not found then raise exception 'Linked truck not found'; end if;
      if v_truck.plate_key <> v_key or v_truck.partner_id is distinct from new.partner_id then
        raise exception 'Linked truck must use the same Partner organization and plate number';
      end if;
    elsif exists (
      select 1 from public.trucks truck where truck.plate_key = v_key
    ) then raise exception 'Plate number already exists in operational fleet'; end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_fleet_plate_uniqueness() from public, anon, authenticated;
create trigger trucks_plate_uniqueness_guard
before insert or update of plate_number, partner_id on public.trucks
for each row execute function private.guard_fleet_plate_uniqueness();
create trigger partner_fleet_plate_uniqueness_guard
before insert or update of plate_number, partner_id, truck_id on public.partner_fleet_vehicles
for each row execute function private.guard_fleet_plate_uniqueness();

create or replace function private.record_fleet_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('app.fleet_change_reason', true), '');
  v_source text := coalesce(nullif(current_setting('app.fleet_change_source', true), ''), 'system');
  v_actor uuid := auth.uid();
  v_partner uuid;
begin
  if tg_table_name = 'trucks' then
    v_partner := new.partner_id;
    if tg_op = 'INSERT' then
      insert into public.fleet_audit_events(
        entity_type, entity_id, truck_id, partner_id, subject_driver_id,
        event_type, reason, new_values, actor_id, source
      ) values (
        'truck', new.id, new.id, new.partner_id, new.driver_id,
        'created', v_reason,
        jsonb_build_object('status', new.status, 'plate_number', new.plate_number),
        v_actor, v_source
      );
    else
      if old.status is distinct from new.status then
        insert into public.fleet_audit_events(
          entity_type, entity_id, truck_id, partner_id, subject_driver_id,
          event_type, reason, old_values, new_values, actor_id, source
        ) values (
          'truck', new.id, new.id, new.partner_id, new.driver_id,
          'status_changed', v_reason,
          jsonb_build_object('status', old.status), jsonb_build_object('status', new.status),
          v_actor, v_source
        );
      end if;
      if old.driver_id is distinct from new.driver_id then
        insert into public.fleet_audit_events(
          entity_type, entity_id, truck_id, partner_id, subject_driver_id,
          event_type, reason, old_values, new_values, actor_id, source
        ) values (
          'truck', new.id, new.id, new.partner_id, coalesce(new.driver_id, old.driver_id),
          case when new.driver_id is null then 'driver_unassigned' else 'driver_assigned' end,
          v_reason,
          jsonb_build_object('driver_id', old.driver_id),
          jsonb_build_object('driver_id', new.driver_id),
          v_actor, v_source
        );
      end if;
      if old.ownership_type is distinct from new.ownership_type
         or old.fuel_type is distinct from new.fuel_type
         or old.branch_id is distinct from new.branch_id
         or old.insurance_expiry is distinct from new.insurance_expiry
         or old.license_expiry is distinct from new.license_expiry
         or old.roadworthiness_expiry is distinct from new.roadworthiness_expiry
         or old.current_odometer_km is distinct from new.current_odometer_km
         or old.last_service_date is distinct from new.last_service_date
         or old.next_service_date is distinct from new.next_service_date
         or old.maintenance_status is distinct from new.maintenance_status then
        insert into public.fleet_audit_events(
          entity_type, entity_id, truck_id, partner_id, subject_driver_id,
          event_type, reason, old_values, new_values, actor_id, source
        ) values (
          'truck', new.id, new.id, new.partner_id, new.driver_id,
          'profile_updated', v_reason,
          jsonb_build_object(
            'ownership_type', old.ownership_type, 'fuel_type', old.fuel_type,
            'branch_id', old.branch_id, 'current_odometer_km', old.current_odometer_km,
            'insurance_expiry', old.insurance_expiry, 'license_expiry', old.license_expiry,
            'roadworthiness_expiry', old.roadworthiness_expiry,
            'last_service_date', old.last_service_date, 'next_service_date', old.next_service_date,
            'maintenance_status', old.maintenance_status
          ),
          jsonb_build_object(
            'ownership_type', new.ownership_type, 'fuel_type', new.fuel_type,
            'branch_id', new.branch_id, 'current_odometer_km', new.current_odometer_km,
            'insurance_expiry', new.insurance_expiry, 'license_expiry', new.license_expiry,
            'roadworthiness_expiry', new.roadworthiness_expiry,
            'last_service_date', new.last_service_date, 'next_service_date', new.next_service_date,
            'maintenance_status', new.maintenance_status
          ),
          v_actor, v_source
        );
      end if;
    end if;
  elsif tg_table_name = 'partner_fleet_vehicles' then
    if tg_op = 'INSERT' then
      insert into public.fleet_audit_events(
        entity_type, entity_id, truck_id, partner_vehicle_id, partner_id,
        subject_driver_id, event_type, reason, new_values, actor_id, source
      ) values (
        'partner_vehicle', new.id, new.truck_id, new.id, new.partner_id,
        new.assigned_driver_id, 'created', v_reason,
        jsonb_build_object('status', new.status, 'plate_number', new.plate_number),
        v_actor, v_source
      );
    elsif old.status is distinct from new.status then
      insert into public.fleet_audit_events(
        entity_type, entity_id, truck_id, partner_vehicle_id, partner_id,
        subject_driver_id, event_type, reason, old_values, new_values, actor_id, source
      ) values (
        'partner_vehicle', new.id, new.truck_id, new.id, new.partner_id,
        new.assigned_driver_id, 'status_changed', v_reason,
        jsonb_build_object('status', old.status), jsonb_build_object('status', new.status),
        v_actor, v_source
      );
    end if;
  elsif tg_table_name = 'truck_maintenance_records' then
    select truck.partner_id into v_partner from public.trucks truck where truck.id = new.truck_id;
    if tg_op = 'INSERT' then
      insert into public.fleet_audit_events(
        entity_type, entity_id, truck_id, partner_id, event_type,
        reason, new_values, actor_id, source
      ) values (
        'maintenance', new.id, new.truck_id, v_partner, 'maintenance_created',
        v_reason,
        jsonb_build_object(
          'maintenance_type', new.maintenance_type, 'status', new.status,
          'service_date', new.service_date, 'cost_etb', new.cost_etb
        ), v_actor, v_source
      );
    elsif old.status is distinct from new.status then
      insert into public.fleet_audit_events(
        entity_type, entity_id, truck_id, partner_id, event_type,
        reason, old_values, new_values, actor_id, source
      ) values (
        'maintenance', new.id, new.truck_id, v_partner, 'maintenance_status_changed',
        v_reason, jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status), v_actor, v_source
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.record_fleet_audit() from public, anon, authenticated;
create trigger trucks_enterprise_audit
after insert or update on public.trucks
for each row execute function private.record_fleet_audit();
create trigger partner_fleet_enterprise_audit
after insert or update on public.partner_fleet_vehicles
for each row execute function private.record_fleet_audit();
create trigger truck_maintenance_enterprise_audit
after insert or update of status on public.truck_maintenance_records
for each row execute function private.record_fleet_audit();

create or replace function private.sync_partner_fleet_from_truck()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.partner_fleet_vehicles
  set plate_number = new.plate_number,
      vehicle_type = new.vehicle_type,
      capacity_tons = new.capacity_tons,
      status = new.status,
      ownership_type = case when new.ownership_type = 'company' then 'partner' else new.ownership_type end,
      fuel_type = new.fuel_type,
      branch_id = new.branch_id,
      assigned_driver_id = new.driver_id,
      current_odometer_km = new.current_odometer_km,
      insurance_expiry = new.insurance_expiry,
      license_expiry = new.license_expiry,
      roadworthiness_expiry = new.roadworthiness_expiry,
      last_service_date = new.last_service_date,
      next_service_date = new.next_service_date,
      maintenance_status = new.maintenance_status,
      updated_at = now()
  where truck_id = new.id;
  return new;
end;
$$;

revoke all on function private.sync_partner_fleet_from_truck() from public, anon, authenticated;
create trigger trucks_sync_partner_fleet
after update on public.trucks
for each row execute function private.sync_partner_fleet_from_truck();

create or replace function public.sync_truck_odometer_from_maintenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.fleet_change_source', 'system', true);
  perform set_config(
    'app.fleet_change_reason',
    'Maintenance ledger synchronization',
    true
  );
  update public.trucks
  set current_odometer_km = case
        when new.status = 'completed' and new.odometer_km is not null
          then greatest(coalesce(current_odometer_km, 0), new.odometer_km)
        else current_odometer_km end,
      last_service_date = case
        when new.status = 'completed'
          then greatest(coalesce(last_service_date, new.service_date), new.service_date)
        else last_service_date end,
      next_service_date = case
        when new.status = 'completed' then new.next_service_date
        else next_service_date end,
      maintenance_status = case
        when new.status = 'in_progress' then 'in_progress'
        when new.status = 'scheduled' then 'scheduled'
        when new.status = 'completed' and new.next_service_date is not null
          and new.next_service_date < current_date then 'overdue'
        when new.status = 'completed' and new.next_service_date is not null then 'scheduled'
        when new.status = 'completed' then 'clear'
        else maintenance_status end,
      status = case
        when new.status = 'in_progress' and status not in ('on_trip', 'suspended', 'inactive')
          then 'maintenance'
        else status end,
      updated_at = now()
  where id = new.truck_id;
  return new;
end;
$$;

revoke all on function public.sync_truck_odometer_from_maintenance()
  from public, anon, authenticated;

create or replace function public.fleet_enterprise_vehicles(p_partner_id uuid default null)
returns table(
  vehicle_id uuid,
  partner_vehicle_id uuid,
  partner_id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  status text,
  ownership_type text,
  fuel_type text,
  branch_id uuid,
  branch_name text,
  assigned_driver_id uuid,
  assigned_driver_name text,
  active_trip_id uuid,
  active_trip_reference text,
  active_trip_status text,
  current_odometer_km numeric,
  insurance_expiry date,
  license_expiry date,
  roadworthiness_expiry date,
  last_service_date date,
  next_service_date date,
  maintenance_status text,
  health_status text,
  dispatch_ready boolean,
  gps_provider text,
  last_location_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_partner_id is null then
    if not (select private.is_admin_or_ceo()) then
      raise exception 'Admin or CEO access required';
    end if;
  elsif not public.can_view_partner_finance(p_partner_id) then
    raise exception 'Partner fleet access denied';
  end if;

  return query
  with operational as (
    select
      truck.id as vehicle_id,
      partner_vehicle.id as partner_vehicle_id,
      truck.partner_id,
      truck.plate_number,
      truck.vehicle_type,
      truck.capacity_tons,
      case when trip.id is not null then 'on_trip' else truck.status end as status,
      truck.ownership_type,
      truck.fuel_type,
      truck.branch_id,
      branch.name as branch_name,
      truck.driver_id as assigned_driver_id,
      driver.full_name as assigned_driver_name,
      trip.id as active_trip_id,
      trip.tracking_id as active_trip_reference,
      trip.status::text as active_trip_status,
      truck.current_odometer_km,
      truck.insurance_expiry,
      truck.license_expiry,
      truck.roadworthiness_expiry,
      truck.last_service_date,
      truck.next_service_date,
      truck.maintenance_status,
      truck.gps_provider,
      case when trip.id is null then null else (
        select max(ping.recorded_at) from public.tracking_pings ping where ping.order_id = trip.id
      ) end as last_location_at,
      truck.updated_at
    from public.trucks truck
    left join public.partner_fleet_vehicles partner_vehicle on partner_vehicle.truck_id = truck.id
    left join public.fleet_branches branch on branch.id = truck.branch_id
    left join public.profiles driver on driver.id = truck.driver_id
    left join lateral (
      select active_order.id, active_order.tracking_id, active_order.status
      from public.orders active_order
      where active_order.truck_id = truck.id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
      order by active_order.accepted_at desc nulls last, active_order.created_at desc
      limit 1
    ) trip on true
    where p_partner_id is null or truck.partner_id = p_partner_id
  ), standalone_partner as (
    select
      vehicle.id as vehicle_id,
      vehicle.id as partner_vehicle_id,
      vehicle.partner_id,
      vehicle.plate_number,
      vehicle.vehicle_type,
      vehicle.capacity_tons,
      vehicle.status,
      vehicle.ownership_type,
      vehicle.fuel_type,
      vehicle.branch_id,
      branch.name as branch_name,
      vehicle.assigned_driver_id,
      driver.full_name as assigned_driver_name,
      null::uuid as active_trip_id,
      null::text as active_trip_reference,
      null::text as active_trip_status,
      vehicle.current_odometer_km,
      vehicle.insurance_expiry,
      vehicle.license_expiry,
      vehicle.roadworthiness_expiry,
      vehicle.last_service_date,
      vehicle.next_service_date,
      vehicle.maintenance_status,
      null::text as gps_provider,
      null::timestamptz as last_location_at,
      vehicle.updated_at
    from public.partner_fleet_vehicles vehicle
    left join public.fleet_branches branch on branch.id = vehicle.branch_id
    left join public.profiles driver on driver.id = vehicle.assigned_driver_id
    where vehicle.truck_id is null
      and (p_partner_id is null or vehicle.partner_id = p_partner_id)
  ), vehicles as (
    select * from operational
    union all
    select * from standalone_partner
  ), health as (
    select vehicles.*,
      case
        when vehicles.status in ('maintenance', 'suspended', 'inactive')
          or vehicles.maintenance_status in ('in_progress', 'overdue')
          or vehicles.insurance_expiry < current_date
          or vehicles.license_expiry < current_date
          or vehicles.roadworthiness_expiry < current_date
          or vehicles.next_service_date < current_date then 'critical'
        when vehicles.insurance_expiry <= current_date + 30
          or vehicles.license_expiry <= current_date + 30
          or vehicles.roadworthiness_expiry <= current_date + 30
          or vehicles.next_service_date <= current_date + 30
          or vehicles.maintenance_status = 'scheduled' then 'attention'
        else 'healthy'
      end as health_status
    from vehicles
  )
  select
    health.vehicle_id, health.partner_vehicle_id, health.partner_id,
    health.plate_number, health.vehicle_type, health.capacity_tons,
    health.status, health.ownership_type, health.fuel_type,
    health.branch_id, health.branch_name,
    health.assigned_driver_id, health.assigned_driver_name,
    health.active_trip_id, health.active_trip_reference, health.active_trip_status,
    health.current_odometer_km,
    health.insurance_expiry, health.license_expiry, health.roadworthiness_expiry,
    health.last_service_date, health.next_service_date, health.maintenance_status,
    health.health_status,
    (health.status = 'available' and health.health_status <> 'critical') as dispatch_ready,
    health.gps_provider, health.last_location_at, health.updated_at
  from health
  order by health.plate_number;
end;
$$;

revoke all on function public.fleet_enterprise_vehicles(uuid) from public, anon;
grant execute on function public.fleet_enterprise_vehicles(uuid) to authenticated;

create or replace function public.fleet_enterprise_summary(p_partner_id uuid default null)
returns table(
  total bigint,
  available bigint,
  assigned bigint,
  on_trip bigint,
  maintenance bigint,
  suspended bigint,
  inactive bigint,
  expiry_alerts bigint,
  service_alerts bigint,
  dispatch_ready bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(*) filter (where vehicle.status = 'available')::bigint,
    count(*) filter (where vehicle.status = 'assigned')::bigint,
    count(*) filter (where vehicle.status = 'on_trip')::bigint,
    count(*) filter (where vehicle.status = 'maintenance')::bigint,
    count(*) filter (where vehicle.status = 'suspended')::bigint,
    count(*) filter (where vehicle.status = 'inactive')::bigint,
    count(*) filter (
      where vehicle.insurance_expiry <= current_date + 30
         or vehicle.license_expiry <= current_date + 30
         or vehicle.roadworthiness_expiry <= current_date + 30
    )::bigint,
    count(*) filter (
      where vehicle.next_service_date <= current_date + 30
         or vehicle.maintenance_status in ('scheduled', 'in_progress', 'overdue')
    )::bigint,
    count(*) filter (where vehicle.dispatch_ready)::bigint
  from public.fleet_enterprise_vehicles(p_partner_id) vehicle;
$$;

revoke all on function public.fleet_enterprise_summary(uuid) from public, anon;
grant execute on function public.fleet_enterprise_summary(uuid) to authenticated;

create or replace function public.create_fleet_branch(
  p_partner_id uuid,
  p_name text,
  p_code text,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  if p_partner_id is null then
    if not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
  elsif not (select private.can_manage_partner_fleet(p_partner_id)) then
    raise exception 'Partner fleet management access denied';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'Branch name must be between 2 and 120 characters';
  end if;
  if v_code !~ '^[A-Z0-9_-]{2,30}$' then raise exception 'Invalid branch code'; end if;

  perform set_config('app.fleet_change_source', case when p_partner_id is null then 'admin' else 'partner' end, true);
  insert into public.fleet_branches(partner_id, name, code, address, created_by)
  values (p_partner_id, btrim(p_name), v_code, nullif(btrim(coalesce(p_address, '')), ''), v_actor)
  returning id into v_id;
  insert into public.fleet_audit_events(
    entity_type, entity_id, partner_id, event_type, reason, new_values, actor_id, source
  ) values (
    'branch', v_id, p_partner_id, 'created', 'Fleet branch created',
    jsonb_build_object('name', btrim(p_name), 'code', v_code), v_actor,
    case when p_partner_id is null then 'admin' else 'partner' end
  );
  return v_id;
exception when unique_violation then
  raise exception 'Branch code already exists in this organization';
end;
$$;

create or replace function public.create_fleet_vehicle(
  p_partner_id uuid,
  p_plate_number text,
  p_vehicle_type text,
  p_capacity_tons numeric,
  p_ownership_type text,
  p_fuel_type text,
  p_branch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_truck_id uuid;
  v_partner_vehicle_id uuid;
  v_ownership text := lower(btrim(coalesce(p_ownership_type, case when p_partner_id is null then 'company' else 'partner' end)));
  v_fuel text := nullif(lower(btrim(coalesce(p_fuel_type, ''))), '');
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  if p_partner_id is null then
    if not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
    if v_ownership not in ('company', 'leased', 'owner_operator') then raise exception 'Invalid company ownership type'; end if;
  else
    if not (select private.can_manage_partner_fleet(p_partner_id)) then
      raise exception 'Partner fleet management access denied';
    end if;
    if v_ownership not in ('partner', 'leased', 'owner_operator') then raise exception 'Invalid Partner ownership type'; end if;
  end if;
  if char_length(btrim(coalesce(p_vehicle_type, ''))) not between 2 and 100 then
    raise exception 'Truck type must be between 2 and 100 characters';
  end if;
  if p_capacity_tons is not null and p_capacity_tons <= 0 then raise exception 'Capacity must be positive'; end if;
  if v_fuel is not null and v_fuel not in ('diesel', 'petrol', 'electric', 'hybrid', 'cng', 'other') then
    raise exception 'Invalid fuel type';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.fleet_branches branch
    where branch.id = p_branch_id and branch.active
      and branch.partner_id is not distinct from p_partner_id
  ) then raise exception 'Branch does not belong to this fleet'; end if;

  perform set_config('app.fleet_change_source', case when p_partner_id is null then 'admin' else 'partner' end, true);
  perform set_config('app.fleet_change_reason', 'Vehicle registered', true);
  insert into public.trucks(
    plate_number, vehicle_type, capacity_tons, status, created_by,
    ownership_type, fuel_type, branch_id, partner_id
  ) values (
    upper(btrim(p_plate_number)), btrim(p_vehicle_type), p_capacity_tons,
    'available', v_actor, v_ownership, v_fuel, p_branch_id, p_partner_id
  ) returning id into v_truck_id;

  if p_partner_id is not null then
    insert into public.partner_fleet_vehicles(
      partner_id, truck_id, plate_number, vehicle_type, capacity_tons,
      status, ownership_type, fuel_type, branch_id, created_by
    ) values (
      p_partner_id, v_truck_id, upper(btrim(p_plate_number)), btrim(p_vehicle_type),
      p_capacity_tons, 'available', v_ownership, v_fuel, p_branch_id, v_actor
    ) returning id into v_partner_vehicle_id;
  end if;
  return v_truck_id;
exception when unique_violation then
  raise exception 'Plate number already exists';
end;
$$;

create or replace function public.update_fleet_vehicle_profile(
  p_truck_id uuid,
  p_ownership_type text,
  p_fuel_type text,
  p_branch_id uuid,
  p_current_odometer_km numeric,
  p_insurance_expiry date,
  p_license_expiry date,
  p_roadworthiness_expiry date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_truck public.trucks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ownership text := lower(btrim(coalesce(p_ownership_type, '')));
  v_fuel text := nullif(lower(btrim(coalesce(p_fuel_type, ''))), '');
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select * into v_truck from public.trucks where id = p_truck_id for update;
  if not found then raise exception 'Fleet vehicle not found'; end if;
  if v_truck.partner_id is null then
    if not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
    if v_ownership not in ('company', 'leased', 'owner_operator') then raise exception 'Invalid ownership type'; end if;
  else
    if not (select private.can_manage_partner_fleet(v_truck.partner_id)) then
      raise exception 'Partner fleet management access denied';
    end if;
    if v_ownership not in ('partner', 'leased', 'owner_operator') then raise exception 'Invalid ownership type'; end if;
  end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Profile change reason is required'; end if;
  if p_current_odometer_km is not null
     and p_current_odometer_km < coalesce(v_truck.current_odometer_km, 0) then
    raise exception 'Odometer cannot move backwards';
  end if;
  if v_fuel is not null and v_fuel not in ('diesel', 'petrol', 'electric', 'hybrid', 'cng', 'other') then
    raise exception 'Invalid fuel type';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.fleet_branches branch
    where branch.id = p_branch_id and branch.active
      and branch.partner_id is not distinct from v_truck.partner_id
  ) then raise exception 'Branch does not belong to this fleet'; end if;

  perform set_config('app.fleet_change_source', case when v_truck.partner_id is null then 'admin' else 'partner' end, true);
  perform set_config('app.fleet_change_reason', v_reason, true);
  update public.trucks
  set ownership_type = v_ownership,
      fuel_type = v_fuel,
      branch_id = p_branch_id,
      current_odometer_km = coalesce(p_current_odometer_km, current_odometer_km),
      insurance_expiry = p_insurance_expiry,
      license_expiry = p_license_expiry,
      roadworthiness_expiry = p_roadworthiness_expiry,
      updated_at = now()
  where id = p_truck_id;
end;
$$;

create or replace function public.admin_set_truck_operational_status(
  p_truck_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_active_trip boolean;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if v_status not in ('available', 'assigned', 'on_trip', 'maintenance', 'suspended', 'inactive') then
    raise exception 'Invalid truck operational status';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Status change reason is required'; end if;
  select exists (
    select 1 from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) into v_has_active_trip;
  if v_has_active_trip and v_status <> 'on_trip' then
    raise exception 'Truck has an active trip and cannot leave On Trip status';
  end if;
  if not v_has_active_trip and v_status = 'on_trip' then
    raise exception 'On Trip status requires an active trip';
  end if;

  perform set_config('app.fleet_change_source', 'admin', true);
  perform set_config('app.fleet_change_reason', v_reason, true);
  update public.trucks
  set status = v_status,
      driver_id = case when v_status in ('available', 'maintenance', 'suspended', 'inactive') then null else driver_id end,
      updated_at = now()
  where id = p_truck_id;
  if not found then raise exception 'Truck not found'; end if;
end;
$$;

create or replace function public.admin_set_truck_operational_status(p_truck_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_set_truck_operational_status(
    p_truck_id, p_status,
    'Legacy Admin operational status action'
  );
end;
$$;

create or replace function public.admin_assign_fleet_driver(
  p_truck_id uuid,
  p_driver_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_active_trip boolean;
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Assignment reason is required'; end if;
  if p_driver_id is not null and not exists (
    select 1 from public.profiles profile
    where profile.id = p_driver_id and profile.role::text = 'driver'
      and profile.driver_status = 'approved'
  ) then raise exception 'Approved Driver account not found'; end if;
  select exists (
    select 1 from public.orders active_order
    where active_order.truck_id = p_truck_id
      and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) into v_has_active_trip;
  if v_has_active_trip then raise exception 'Driver assignment cannot change during an active trip'; end if;
  if p_driver_id is not null and exists (
    select 1 from public.trucks truck
    where truck.driver_id = p_driver_id and truck.id <> p_truck_id
      and truck.status in ('assigned', 'on_trip')
  ) then raise exception 'Driver is already assigned to another active vehicle'; end if;

  perform set_config('app.fleet_change_source', 'admin', true);
  perform set_config('app.fleet_change_reason', v_reason, true);
  update public.trucks
  set driver_id = p_driver_id,
      status = case when p_driver_id is null then 'available' else 'assigned' end,
      updated_at = now()
  where id = p_truck_id and status not in ('maintenance', 'suspended', 'inactive');
  if not found then raise exception 'Available fleet vehicle not found'; end if;
end;
$$;

create or replace function public.create_truck_maintenance_record(
  p_truck_id uuid,
  p_maintenance_type text,
  p_status text,
  p_service_date date,
  p_odometer_km numeric,
  p_cost_etb numeric,
  p_vendor text,
  p_notes text,
  p_next_service_date date,
  p_next_service_odometer_km numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_partner_id uuid;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select truck.partner_id into v_partner_id from public.trucks truck where truck.id = p_truck_id;
  if not found then raise exception 'Fleet vehicle not found'; end if;
  if v_partner_id is null then
    if not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
  elsif not (select private.can_manage_partner_fleet(v_partner_id)) then
    raise exception 'Partner fleet management access denied';
  end if;
  if p_maintenance_type not in ('scheduled_service','oil_change','tyres','repair','inspection','insurance','permit','other') then
    raise exception 'Invalid maintenance type';
  end if;
  if p_status not in ('scheduled','in_progress','completed','cancelled') then raise exception 'Invalid maintenance status'; end if;
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if coalesce(p_cost_etb, 0) < 0 then raise exception 'Maintenance cost cannot be negative'; end if;
  if p_odometer_km is not null and p_odometer_km < 0 then raise exception 'Odometer cannot be negative'; end if;

  perform set_config('app.fleet_change_source', case when v_partner_id is null then 'admin' else 'partner' end, true);
  perform set_config('app.fleet_change_reason', 'Maintenance record created', true);
  insert into public.truck_maintenance_records(
    truck_id, maintenance_type, status, service_date, odometer_km,
    cost_etb, vendor, notes, next_service_date, next_service_odometer_km, created_by
  ) values (
    p_truck_id, p_maintenance_type, p_status, p_service_date, p_odometer_km,
    coalesce(p_cost_etb, 0), nullif(btrim(coalesce(p_vendor, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''), p_next_service_date,
    p_next_service_odometer_km, v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_truck_maintenance_status(
  p_record_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_partner_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select truck.partner_id into v_partner_id
  from public.truck_maintenance_records record
  join public.trucks truck on truck.id = record.truck_id
  where record.id = p_record_id;
  if not found then raise exception 'Maintenance record not found'; end if;
  if v_partner_id is null then
    if not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
  elsif not (select private.can_manage_partner_fleet(v_partner_id)) then
    raise exception 'Partner fleet management access denied';
  end if;
  if p_status not in ('scheduled','in_progress','completed','cancelled') then raise exception 'Invalid maintenance status'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Maintenance status reason is required'; end if;

  perform set_config('app.fleet_change_source', case when v_partner_id is null then 'admin' else 'partner' end, true);
  perform set_config('app.fleet_change_reason', v_reason, true);
  update public.truck_maintenance_records
  set status = p_status, updated_at = now()
  where id = p_record_id;
end;
$$;

revoke all on function public.create_fleet_branch(uuid,text,text,text) from public, anon;
revoke all on function public.create_fleet_vehicle(uuid,text,text,numeric,text,text,uuid) from public, anon;
revoke all on function public.update_fleet_vehicle_profile(uuid,text,text,uuid,numeric,date,date,date,text) from public, anon;
revoke all on function public.admin_set_truck_operational_status(uuid,text,text) from public, anon;
revoke all on function public.admin_set_truck_operational_status(uuid,text) from public, anon;
revoke all on function public.admin_assign_fleet_driver(uuid,uuid,text) from public, anon;
revoke all on function public.create_truck_maintenance_record(uuid,text,text,date,numeric,numeric,text,text,date,numeric) from public, anon;
revoke all on function public.update_truck_maintenance_status(uuid,text,text) from public, anon;

grant execute on function public.create_fleet_branch(uuid,text,text,text) to authenticated;
grant execute on function public.create_fleet_vehicle(uuid,text,text,numeric,text,text,uuid) to authenticated;
grant execute on function public.update_fleet_vehicle_profile(uuid,text,text,uuid,numeric,date,date,date,text) to authenticated;
grant execute on function public.admin_set_truck_operational_status(uuid,text,text) to authenticated;
grant execute on function public.admin_set_truck_operational_status(uuid,text) to authenticated;
grant execute on function public.admin_assign_fleet_driver(uuid,uuid,text) to authenticated;
grant execute on function public.create_truck_maintenance_record(uuid,text,text,date,numeric,numeric,text,text,date,numeric) to authenticated;
grant execute on function public.update_truck_maintenance_status(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
