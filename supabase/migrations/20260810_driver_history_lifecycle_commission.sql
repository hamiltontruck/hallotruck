-- Driver audit history + safe lifecycle controls.
-- IMPORTANT: do not auto-apply to production. Apply only after the PR is merged and approved.

create table if not exists public.driver_verification_history (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  truck_id uuid references public.trucks(id) on delete set null,
  document_key text not null,
  file_path text not null,
  original_name text not null,
  mime_type text not null,
  expiry_date date,
  status text not null,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  archive_reason text not null default 'updated',
  archived_at timestamptz not null default now()
);

create index if not exists driver_verification_history_driver_idx
  on public.driver_verification_history(driver_id, archived_at desc);
create index if not exists driver_verification_history_source_idx
  on public.driver_verification_history(source_document_id, archived_at desc);

alter table public.driver_verification_history enable row level security;

drop policy if exists "driver verification history own read" on public.driver_verification_history;
create policy "driver verification history own read"
  on public.driver_verification_history for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists "driver verification history leadership read" on public.driver_verification_history;
create policy "driver verification history leadership read"
  on public.driver_verification_history for select to authenticated
  using (coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','ceo'));

create or replace function public.archive_driver_verification_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := 'updated';
begin
  if tg_op = 'UPDATE' then
    if new.file_path is distinct from old.file_path then
      v_reason := 'replaced';
    elsif new.status is distinct from old.status then
      v_reason := 'status_changed';
    end if;
  elsif tg_op = 'DELETE' then
    v_reason := 'deleted';
  end if;

  insert into public.driver_verification_history (
    source_document_id,
    driver_id,
    truck_id,
    document_key,
    file_path,
    original_name,
    mime_type,
    expiry_date,
    status,
    rejection_reason,
    reviewed_by,
    reviewed_at,
    source_created_at,
    source_updated_at,
    archive_reason
  ) values (
    old.id,
    old.driver_id,
    old.truck_id,
    old.document_key,
    old.file_path,
    old.original_name,
    old.mime_type,
    old.expiry_date,
    old.status,
    old.rejection_reason,
    old.reviewed_by,
    old.reviewed_at,
    old.created_at,
    old.updated_at,
    v_reason
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_verification_archive_trigger on public.driver_verification_files;
create trigger driver_verification_archive_trigger
before update or delete on public.driver_verification_files
for each row execute function public.archive_driver_verification_version();

-- Preserve any document object that is referenced by the current record or audit history.
-- The existing client cleanup still works for failed uploads because those paths are unreferenced.
drop policy if exists "driver verification storage own delete" on storage.objects;
create policy "driver verification storage own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'driver-verification'
    and split_part(name, '/', 1) = auth.uid()::text
    and not exists (
      select 1
      from public.driver_verification_files current_file
      where current_file.file_path = name
        and current_file.driver_id = auth.uid()
    )
    and not exists (
      select 1
      from public.driver_verification_history history_file
      where history_file.file_path = name
        and history_file.driver_id = auth.uid()
    )
  );

-- "Remove driver" is intentionally a reversible suspension rather than a destructive delete.
-- This keeps orders, payments, proof-of-delivery and compliance audit records intact.
create or replace function public.admin_suspend_driver(p_driver_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO access required';
  end if;

  select p.role::text
    into v_role
  from public.profiles p
  where p.id = p_driver_id
  for update;

  if not found or v_role <> 'driver' then
    raise exception 'Driver profile not found';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.driver_id = p_driver_id
      and o.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
  ) then
    raise exception 'Finish or reassign the active trip before removing this driver';
  end if;

  update public.profiles
  set driver_status = 'suspended'::public.driver_status
  where id = p_driver_id;

  update public.trucks t
  set driver_id = null,
      status = 'available',
      updated_at = now()
  where t.driver_id = p_driver_id
    and not exists (
      select 1
      from public.orders o
      where o.truck_id = t.id
        and o.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    );

  return true;
end;
$$;

create or replace function public.admin_restore_driver(p_driver_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO access required';
  end if;

  update public.profiles p
  set driver_status = 'pending'::public.driver_status
  where p.id = p_driver_id
    and p.role::text = 'driver'
    and p.driver_status = 'suspended'::public.driver_status;

  if not found then
    raise exception 'Suspended driver profile not found';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_suspend_driver(uuid) from public, anon;
revoke all on function public.admin_restore_driver(uuid) from public, anon;
grant execute on function public.admin_suspend_driver(uuid) to authenticated;
grant execute on function public.admin_restore_driver(uuid) to authenticated;
