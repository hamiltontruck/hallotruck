begin;

-- Keep dispatch eligibility aligned with the compact Admin/CEO verification contract:
-- five driver identity files + three vehicle files = eight required files total.
-- Historical optional evidence remains stored but is not required for dispatch.
create or replace function public.dispatch_documents_valid(
  p_driver_id uuid,
  p_truck_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = p_driver_id
        and p.role::text = 'driver'
        and p.driver_status::text = 'approved'
    )
    and not exists (
      select 1
      from unnest(array[
        'driver_photo',
        'license_front',
        'license_back',
        'national_id_front',
        'national_id_back'
      ]::text[]) required_key
      where not exists (
        select 1
        from public.driver_verification_files vf
        where vf.driver_id = p_driver_id
          and vf.truck_id is null
          and vf.document_key = required_key
          and vf.status = 'verified'
          and (
            required_key not in ('license_front', 'national_id_front')
            or (vf.expiry_date is not null and vf.expiry_date >= current_date)
          )
      )
    )
    and not exists (
      select 1
      from unnest(array[
        'vehicle_registration',
        'truck_front',
        'truck_side'
      ]::text[]) required_key
      where not exists (
        select 1
        from public.driver_verification_files vf
        where vf.driver_id = p_driver_id
          and vf.truck_id = p_truck_id
          and vf.document_key = required_key
          and vf.status = 'verified'
      )
    );
$$;

revoke all on function public.dispatch_documents_valid(uuid, uuid) from public, anon;
grant execute on function public.dispatch_documents_valid(uuid, uuid) to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
