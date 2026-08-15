create or replace function public.customer_can_read_assignment_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.driver_verification_files vf
    join public.orders o
      on o.customer_id = auth.uid()
     and o.driver_id = vf.driver_id
    join public.profiles p
      on p.id = o.driver_id
     and p.driver_status = 'approved'::public.driver_status
    where vf.file_path = p_object_name
      and vf.status = 'verified'
      and (
        (vf.document_key = 'driver_photo' and vf.truck_id is null)
        or
        (vf.document_key = 'truck_front' and vf.truck_id = o.truck_id)
      )
  );
$$;

revoke all on function public.customer_can_read_assignment_photo(text) from public, anon;
grant execute on function public.customer_can_read_assignment_photo(text) to authenticated;

drop policy if exists "customer reads assigned verified truck photo" on storage.objects;
drop policy if exists "customer reads assigned verification photos" on storage.objects;

create policy "customer reads assigned verification photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'driver-verification'
  and public.customer_can_read_assignment_photo(name)
);
