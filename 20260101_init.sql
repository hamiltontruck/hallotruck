-- Hallo Truck core schema
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ============ PROFILES ============
create type user_role as enum ('customer', 'driver', 'admin');
create type driver_status as enum ('pending', 'approved', 'rejected', 'suspended');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null,
  phone text unique not null,
  vehicle_type text,                 -- e.g. 'flatbed_10t', 'box_truck', 'trailer'
  driver_status driver_status default 'pending',
  rating_avg numeric(3,2) default 5.0,
  created_at timestamptz not null default now()
);

-- ============ DRIVER DOCUMENTS ============
create type doc_type as enum ('license', 'vehicle_reg', 'insurance', 'fayda_id', 'transport_permit');
create type doc_status as enum ('pending', 'verified', 'rejected');

create table driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles(id) on delete cascade,
  doc_type doc_type not null,
  file_path text not null,           -- Supabase Storage path
  status doc_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (driver_id, doc_type)
);

-- ============ ORDERS ============
create type order_status as enum (
  'quoted', 'placed', 'accepted', 'in_transit', 'delivered', 'cancelled'
);
create type payment_status as enum ('unpaid', 'held_escrow', 'released', 'refunded');

create table orders (
  id uuid primary key default gen_random_uuid(),
  tracking_id text unique not null,             -- e.g. HT-20260725-0042
  customer_id uuid not null references profiles(id),
  driver_id uuid references profiles(id),
  pickup geography(point, 4326) not null,
  pickup_address text not null,
  dropoff geography(point, 4326) not null,
  dropoff_address text not null,
  vehicle_type text not null,
  distance_km numeric(8,2),
  price_etb numeric(10,2),
  status order_status not null default 'quoted',
  payment_status payment_status not null default 'unpaid',
  payment_provider text,             -- 'telebirr' | 'mpesa'
  payment_ref text,
  cargo_description text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz
);

create index orders_pickup_idx on orders using gist (pickup);
create index orders_dropoff_idx on orders using gist (dropoff);
create index orders_status_idx on orders (status);

-- ============ LIVE TRACKING PINGS ============
create table tracking_pings (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid not null references profiles(id),
  location geography(point, 4326) not null,
  heading numeric(5,2),
  speed_kmh numeric(5,2),
  recorded_at timestamptz not null default now()
);

create index tracking_pings_order_idx on tracking_pings (order_id, recorded_at desc);

-- ============ RATINGS ============
create table ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) unique,
  customer_id uuid not null references profiles(id),
  driver_id uuid not null references profiles(id),
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ============ RLS ============
alter table profiles enable row level security;
alter table driver_documents enable row level security;
alter table orders enable row level security;
alter table tracking_pings enable row level security;
alter table ratings enable row level security;

create policy "profiles: self read/update" on profiles
  for select using (auth.uid() = id or exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  ));
create policy "profiles: self update" on profiles
  for update using (auth.uid() = id);

create policy "orders: customer sees own" on orders
  for select using (
    customer_id = auth.uid() or driver_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "orders: customer creates" on orders
  for insert with check (customer_id = auth.uid());

create policy "docs: driver own" on driver_documents
  for all using (
    driver_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "tracking: participants read" on tracking_pings
  for select using (
    exists (
      select 1 from orders o where o.id = order_id
      and (o.customer_id = auth.uid() or o.driver_id = auth.uid())
    )
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "tracking: driver inserts own" on tracking_pings
  for insert with check (driver_id = auth.uid());
