-- Professional driver + vehicle verification foundation.
-- IMPORTANT: this migration is intentionally not auto-applied to production.

alter table public.profiles
  add column if not exists email text,
  add column if not exists home_address text;

create table if not exists public.driver_verification_files (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  truck_id uuid references public.trucks(id) on delete cascade,
  document_key text not null check (document_key in (
    'driver_photo',
    'license_front', 'license_back',
    'national_id_front', 'national_id_back',
    'vehicle_registration', 'insurance', 'transport_permit',
    'truck_front', 'truck_back', 'truck_side', 'truck_loading_area'
  )),
  file_path text not null,
  original_name text not null,
  mime_type text not null,
  expiry_date date,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (truck_id is null and document_key in ('driver_photo','license_front','license_back','national_id_front','national_id_back'))
    or
    (truck_id is not null and document_key in ('vehicle_registration','insurance','transport_permit','truck_front','truck_back','truck_side','truck_loading_area'))
  )
);

create unique index if not exists driver_verification_identity_doc_uq
  on public.driver_verification_files(driver_id, document_key)
  where truck_id is null;

create unique index if not exists driver_verification_truck_doc_uq
  on public.driver_verification_files(truck_id, document_key)
  where truck_id is not null;

create index if not exists driver_verification_driver_idx
  on public.driver_verification_files(driver_id, status);
create index if not exists driver_verification_truck_idx
  on public.driver_verification_files(truck_id, status);

alter table public.driver_verification_files enable row level security;

drop policy if exists "driver verification own read" on public.driver_verification_files;
create policy "driver verification own read"
  on public.driver_verification_files for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists "driver verification own insert" on public.driver_verification_files;
create policy "driver verification own insert"
  on public.driver_verification_files for insert to authenticated
  with check (driver_id = auth.uid());

drop policy if exists "driver verification own update" on public.driver_verification_files;
create policy "driver verification own update"
  on public.driver_verification_files for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid() and status = 'pending');

drop policy if exists "driver verification leadership manage" on public.driver_verification_files;
create policy "driver verification leadership manage"
  on public.driver_verification_files for all to authenticated
  using (coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo'))
  with check (coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo'));

-- Drivers may read a truck that is assigned to them or that appears on one of their trips.
drop policy if exists "trucks driver reads assigned" on public.trucks;
create policy "trucks driver reads assigned"
  on public.trucks for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1
      from public.orders o
      where o.truck_id = trucks.id
        and o.driver_id = auth.uid()
    )
  );

-- Private verification storage. Customer visibility is restricted to a verified truck-front photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-verification',
  'driver-verification',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "driver verification storage own read" on storage.objects;
create policy "driver verification storage own read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "driver verification storage own insert" on storage.objects;
create policy "driver verification storage own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "driver verification storage own update" on storage.objects;
create policy "driver verification storage own update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'driver-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'driver-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "driver verification storage own delete" on storage.objects;
create policy "driver verification storage own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'driver-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "driver verification storage leadership read" on storage.objects;
create policy "driver verification storage leadership read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-verification'
    and coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo')
  );

-- Customers may read only a verified front photo of the truck assigned to one of their orders.
drop policy if exists "customer reads assigned verified truck photo" on storage.objects;
create policy "customer reads assigned verified truck photo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-verification'
    and exists (
      select 1
      from public.driver_verification_files vf
      join public.orders o on o.truck_id = vf.truck_id
      where vf.file_path = name
        and vf.document_key = 'truck_front'
        and vf.status = 'verified'
        and o.customer_id = auth.uid()
    )
  );

-- Safe customer-facing assignment card: never exposes license/ID files.
create or replace function public.customer_driver_assignment_cards()
returns table (
  order_id uuid,
  driver_name text,
  driver_phone text,
  driver_verified boolean,
  license_verified boolean,
  national_id_verified boolean,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  truck_photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    p.full_name,
    p.phone,
    (
      p.driver_status = 'approved'::public.driver_status
      and exists (
        select 1 from public.driver_verification_files lf
        where lf.driver_id = p.id and lf.truck_id is null and lf.document_key = 'license_front' and lf.status = 'verified'
      )
      and exists (
        select 1 from public.driver_verification_files lb
        where lb.driver_id = p.id and lb.truck_id is null and lb.document_key = 'license_back' and lb.status = 'verified'
      )
    ) as driver_verified,
    (
      exists (select 1 from public.driver_verification_files lf where lf.driver_id = p.id and lf.truck_id is null and lf.document_key = 'license_front' and lf.status = 'verified')
      and exists (select 1 from public.driver_verification_files lb where lb.driver_id = p.id and lb.truck_id is null and lb.document_key = 'license_back' and lb.status = 'verified')
    ) as license_verified,
    (
      exists (select 1 from public.driver_verification_files nf where nf.driver_id = p.id and nf.truck_id is null and nf.document_key = 'national_id_front' and nf.status = 'verified')
      and exists (select 1 from public.driver_verification_files nb where nb.driver_id = p.id and nb.truck_id is null and nb.document_key = 'national_id_back' and nb.status = 'verified')
    ) as national_id_verified,
    t.plate_number,
    t.vehicle_type,
    t.capacity_tons,
    (
      select vf.file_path
      from public.driver_verification_files vf
      where vf.truck_id = t.id
        and vf.document_key = 'truck_front'
        and vf.status = 'verified'
      order by vf.updated_at desc
      limit 1
    ) as truck_photo_path
  from public.orders o
  join public.profiles p on p.id = o.driver_id
  left join public.trucks t on t.id = o.truck_id
  where o.customer_id = auth.uid()
    and o.driver_id is not null;
$$;

revoke all on function public.customer_driver_assignment_cards() from public, anon;
grant execute on function public.customer_driver_assignment_cards() to authenticated;
