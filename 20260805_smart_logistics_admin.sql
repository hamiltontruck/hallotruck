-- Applied to Supabase project febgayjolfrooaqenlje on 2026-08-05.
-- Adds Smart Logistics admin entities and app_metadata-backed authorization.
alter type public.user_role add value if not exists 'ceo';

alter table public.orders
  alter column customer_id drop not null,
  alter column pickup drop not null,
  alter column dropoff drop not null,
  add column if not exists customer_name text,
  add column if not exists customer_phone text;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  email text,
  company_name text,
  is_credit_customer boolean not null default false,
  credit_limit_etb numeric(12,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null unique,
  vehicle_type text not null,
  capacity_tons numeric(8,2),
  status text not null default 'available'
    check (status in ('available','assigned','maintenance','inactive')),
  driver_id uuid references public.profiles(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists customer_record_id uuid references public.customers(id);

create index if not exists orders_customer_record_idx on public.orders(customer_record_id);
create index if not exists trucks_status_idx on public.trucks(status);
alter table public.customers enable row level security;
alter table public.trucks enable row level security;

drop policy if exists "profiles: self read/update" on public.profiles;
drop policy if exists "profiles: self update" on public.profiles;
create policy "profiles self or admin read" on public.profiles for select to authenticated
using ((select auth.uid()) = id or coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'));
create policy "profiles self update" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles admin manage" on public.profiles for all to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'))
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'));

create policy "orders admin manage" on public.orders for all to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'))
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'));
create policy "payments admin manage" on public.payments for all to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'))
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'));
create policy "customers admin manage" on public.customers for all to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'))
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'));
create policy "trucks admin manage" on public.trucks for all to authenticated
using (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'))
with check (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo'));

grant select, insert, update, delete on public.customers, public.trucks,
  public.orders, public.payments to authenticated;
