drop function if exists public.customer_driver_assignment_cards();

create function public.customer_driver_assignment_cards()
returns table(
  order_id uuid,
  driver_name text,
  driver_phone text,
  driver_verified boolean,
  license_verified boolean,
  national_id_verified boolean,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  truck_photo_path text,
  driver_photo_path text
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
      and exists (select 1 from public.driver_verification_files lf where lf.driver_id = p.id and lf.truck_id is null and lf.document_key = 'license_front' and lf.status = 'verified')
      and exists (select 1 from public.driver_verification_files lb where lb.driver_id = p.id and lb.truck_id is null and lb.document_key = 'license_back' and lb.status = 'verified')
    ),
    (
      exists (select 1 from public.driver_verification_files lf where lf.driver_id = p.id and lf.truck_id is null and lf.document_key = 'license_front' and lf.status = 'verified')
      and exists (select 1 from public.driver_verification_files lb where lb.driver_id = p.id and lb.truck_id is null and lb.document_key = 'license_back' and lb.status = 'verified')
    ),
    (
      exists (select 1 from public.driver_verification_files nf where nf.driver_id = p.id and nf.truck_id is null and nf.document_key = 'national_id_front' and nf.status = 'verified')
      and exists (select 1 from public.driver_verification_files nb where nb.driver_id = p.id and nb.truck_id is null and nb.document_key = 'national_id_back' and nb.status = 'verified')
    ),
    t.plate_number,
    t.vehicle_type,
    t.capacity_tons,
    (
      select vf.file_path from public.driver_verification_files vf
      where vf.truck_id = t.id and vf.document_key = 'truck_front' and vf.status = 'verified'
      order by vf.updated_at desc limit 1
    ),
    (
      select vf.file_path from public.driver_verification_files vf
      where vf.driver_id = p.id and vf.truck_id is null and vf.document_key = 'driver_photo' and vf.status = 'verified'
      order by vf.updated_at desc limit 1
    )
  from public.orders o
  join public.profiles p on p.id = o.driver_id
  left join public.trucks t on t.id = o.truck_id
  where o.customer_id = auth.uid() and o.driver_id is not null;
$$;

revoke all on function public.customer_driver_assignment_cards() from public, anon;
grant execute on function public.customer_driver_assignment_cards() to authenticated;
