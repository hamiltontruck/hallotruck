-- Harden Driver document review around the current database-backed leadership boundary.
-- Apply only after this focused PR is approved and merged.

begin;

-- Leadership can read current evidence directly. Review mutations go through
-- the narrow, audited RPC below instead of a broad table ALL policy.
drop policy if exists "driver verification leadership manage" on public.driver_verification_files;
drop policy if exists "driver verification leadership read" on public.driver_verification_files;
create policy "driver verification leadership read"
  on public.driver_verification_files
  for select
  to authenticated
  using ((select private.is_admin_or_ceo()));

-- Replace stale JWT-claim authorization with the live database profile check.
drop policy if exists "driver verification history leadership read" on public.driver_verification_history;
create policy "driver verification history leadership read"
  on public.driver_verification_history
  for select
  to authenticated
  using ((select private.is_admin_or_ceo()));

-- Preserve existing leadership Storage capabilities while moving every
-- authorization decision to the current database-backed Admin/CEO boundary.
drop policy if exists "driver verification storage leadership read" on storage.objects;
create policy "driver verification storage leadership read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-verification'
    and (select private.is_admin_or_ceo())
  );

drop policy if exists "driver verification storage leadership insert" on storage.objects;
create policy "driver verification storage leadership insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'driver-verification'
    and (select private.is_admin_or_ceo())
  );

drop policy if exists "driver verification storage leadership cleanup" on storage.objects;
create policy "driver verification storage leadership cleanup"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'driver-verification'
    and (select private.is_admin_or_ceo())
    and not exists (
      select 1
      from public.driver_verification_files current_file
      where current_file.file_path = storage.objects.name
    )
    and not exists (
      select 1
      from public.driver_verification_history history_file
      where history_file.file_path = storage.objects.name
    )
  );

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

  select verification.expiry_date
    into v_expiry_date
  from public.driver_verification_files verification
  where verification.id = p_document_id
    and verification.file_path = p_expected_file_path
    and verification.status = 'pending'
  for update;

  if not found then
    raise exception 'Document changed or is no longer pending. Refresh before reviewing.' using errcode = '40001';
  end if;
  if v_status = 'verified' and v_expiry_date is not null and v_expiry_date < current_date then
    raise exception 'Expired evidence cannot be verified.' using errcode = '23514';
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

commit;

notify pgrst, 'reload schema';
