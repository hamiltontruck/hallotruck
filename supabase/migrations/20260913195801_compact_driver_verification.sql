begin;

-- Eight required files in five groups. Keep existing optional evidence and audit history.
-- License and National ID each carry one expiry date, on their front record only.

create or replace function public.admin_approve_driver_onboarding(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_truck_id uuid;
begin
  perform private.require_active_leadership('admin_approve_driver_onboarding');
  perform 1 from public.profiles where id = p_driver_id for update;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_driver_id
      and p.role::text = 'driver'
      and p.driver_status::text <> 'suspended'
  ) then
    raise exception 'Active driver profile not found.' using errcode = 'P0002';
  end if;

  select t.id
  into v_truck_id
  from public.trucks t
  where t.driver_id = p_driver_id
  order by t.updated_at desc
  limit 1
  for update;

  if v_truck_id is null then
    raise exception 'Driver vehicle details are required before approval.' using errcode = '23514';
  end if;

  if exists (
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
        and (required_key not in ('license_front', 'national_id_front') or (vf.expiry_date is not null and vf.expiry_date >= current_date))
    )
  ) then
    raise exception 'Verify all five driver identity documents before approval.' using errcode = '23514';
  end if;

  if exists (
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
        and vf.truck_id = v_truck_id
        and vf.document_key = required_key
        and vf.status = 'verified'
    )
  ) then
    raise exception 'Verify vehicle registration, truck front and side photos before approval.' using errcode = '23514';
  end if;

  update public.profiles p
  set driver_status = 'approved'::public.driver_status
  where p.id = p_driver_id;

  update public.trucks t
  set
    status = case when t.status = 'inactive' then 'available' else t.status end,
    updated_at = now()
  where t.id = v_truck_id;
end;
$$;

revoke all on function public.admin_approve_driver_onboarding(uuid) from public, anon;
grant execute on function public.admin_approve_driver_onboarding(uuid) to authenticated;


create or replace function public.admin_review_driver_verification_document(
  p_document_id uuid,
  p_expected_file_path text,
  p_status text,
  p_rejection_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  v_expiry_date date;
  v_document_key text;
begin
  perform private.require_active_leadership('admin_review_driver_verification_document');

  if v_status not in ('verified', 'rejected') then
    raise exception 'Document review status must be verified or rejected.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_expected_file_path, '')), '') is null then
    raise exception 'Expected document path is required.' using errcode = '22023';
  end if;
  if v_status = 'rejected' and v_reason is null then
    raise exception 'A rejection reason is required.' using errcode = '23514';
  end if;

  select verification.expiry_date, verification.document_key
    into v_expiry_date, v_document_key
  from public.driver_verification_files verification
  where verification.id = p_document_id
    and verification.file_path = p_expected_file_path
    and verification.status = 'pending'
  for update;

  if not found then
    raise exception 'Document changed or is no longer pending. Refresh before reviewing.' using errcode = '40001';
  end if;
  if v_status = 'verified' and v_document_key in ('license_front', 'national_id_front') and (v_expiry_date is null or v_expiry_date < current_date) then
    raise exception 'A current expiry date is required for license and National ID front documents.' using errcode = '23514';
  end if;

  update public.driver_verification_files verification
  set status = v_status,
      rejection_reason = case when v_status = 'rejected' then v_reason else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where verification.id = p_document_id
    and verification.file_path = p_expected_file_path
    and verification.status = 'pending';

  if not found then
    raise exception 'Document changed during review. Refresh before retrying.' using errcode = '40001';
  end if;

  return true;
end;
$function$;

revoke all on function public.admin_review_driver_verification_document(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_driver_verification_document(uuid, text, text, text) to authenticated;


create or replace function public.admin_upsert_driver_document(
  p_driver_id uuid,
  p_truck_id uuid,
  p_document_key text,
  p_file_path text,
  p_original_name text,
  p_mime_type text,
  p_expiry_date date default null,
  p_verify boolean default false,
  p_source_note text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_key text := lower(btrim(coalesce(p_document_key, '')));
  v_mime text := lower(btrim(coalesce(p_mime_type, '')));
begin
  perform private.require_active_leadership('admin_upsert_driver_document');
  if v_key in ('license_front', 'national_id_front') and p_expiry_date is null then
    raise exception 'Expiry date is required on the license or National ID front document.' using errcode = '23514';
  end if;
  if v_key in ('driver_photo','truck_front','truck_side') and v_mime = 'application/pdf' then
    raise exception 'A photo is required for this document.' using errcode = '23514';
  end if;
  return public.admin_upsert_driver_document_unchecked_188(
    p_driver_id, p_truck_id, v_key, p_file_path, p_original_name,
    v_mime, case when v_key in ('license_front', 'national_id_front') then p_expiry_date else null end, p_verify, p_source_note
  );
end;
$function$;

-- Vehicle model is descriptive only; canonical vehicle_type still controls matching.
alter table public.trucks add column if not exists model text;

create or replace function public.admin_save_driver_review_fields(
  p_driver_id uuid, p_truck_id uuid, p_full_name text, p_vehicle_type text, p_model text,
  p_expected_name text, p_expected_type text, p_expected_model text
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_type text := nullif(btrim(coalesce(p_vehicle_type, '')), '');
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
  v_driver public.profiles%rowtype;
  v_truck public.trucks%rowtype;
begin
  perform private.require_active_leadership('admin_save_driver_review_fields');
  if char_length(v_name) not between 1 and 120 or char_length(coalesce(v_model,'')) > 120 then
    raise exception 'Enter a driver name and a model of at most 120 characters.' using errcode = '23514';
  end if;
  select * into v_driver from public.profiles where id = p_driver_id and role::text = 'driver' for update;
  if not found then raise exception 'Driver not found.' using errcode = 'P0002'; end if;
  if v_driver.full_name is distinct from p_expected_name then
    raise exception 'Driver details changed. Refresh before saving.' using errcode = '40001';
  end if;
  if p_truck_id is not null then
    select * into v_truck from public.trucks where id = p_truck_id and driver_id = p_driver_id for update;
    if not found then raise exception 'Truck is no longer assigned to this driver.' using errcode = '23514'; end if;
    if v_truck.vehicle_type is distinct from p_expected_type or v_truck.model is distinct from p_expected_model then
      raise exception 'Truck details changed. Refresh before saving.' using errcode = '40001';
    end if;
    if v_type is null or v_type not in ('Pickup','Van','Isuzu 5 Ton','Dry Cargo','Refrigerated','Truck 22 Ton','Truck 25 Ton','Truck 30 Ton','Trailer') then
      raise exception 'Choose a supported truck type.' using errcode = '23514';
    end if;
    if (v_type is distinct from v_truck.vehicle_type or v_model is distinct from v_truck.model)
      and exists (select 1 from public.orders where (truck_id = p_truck_id or driver_id = p_driver_id) and status::text in ('accepted','in_transit')) then
      raise exception 'Finish the active trip before changing truck details.' using errcode = '23514';
    end if;
    update public.trucks set vehicle_type = v_type, model = v_model, updated_at = now() where id = p_truck_id;
  end if;
  update public.profiles set full_name = v_name where id = p_driver_id;
end;
$function$;
revoke all on function public.admin_save_driver_review_fields(uuid,uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_save_driver_review_fields(uuid,uuid,text,text,text,text,text,text) to authenticated;

commit;
notify pgrst, 'reload schema';
