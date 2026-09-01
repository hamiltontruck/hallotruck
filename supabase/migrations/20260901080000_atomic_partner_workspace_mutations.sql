begin;

alter table public.partner_projects
  add column if not exists request_key uuid;
alter table public.partner_project_progress
  add column if not exists request_key uuid;
alter table public.partner_documents
  add column if not exists request_key uuid;

create unique index if not exists partner_projects_request_key_unique
  on public.partner_projects(partner_id, request_key)
  where request_key is not null;
create unique index if not exists partner_project_progress_request_key_unique
  on public.partner_project_progress(partner_id, request_key)
  where request_key is not null;
create unique index if not exists partner_documents_request_key_unique
  on public.partner_documents(partner_id, request_key)
  where request_key is not null;

create or replace function public.partner_create_project(
  p_partner_id uuid,
  p_name text,
  p_description text,
  p_request_key uuid
)
returns public.partner_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_project public.partner_projects%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Partner sign-in is required.';
  end if;
  if not private.can_manage_partner(p_partner_id) then
    raise exception using errcode = '42501', message = 'Partner project management access is required.';
  end if;
  if p_request_key is null then
    raise exception using errcode = '22023', message = 'Request key is required.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception using errcode = '22023', message = 'Project name must contain 2 to 160 characters.';
  end if;
  if v_description is not null and char_length(v_description) > 4000 then
    raise exception using errcode = '22023', message = 'Project description cannot exceed 4000 characters.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-project-create:' || p_partner_id::text || ':' || p_request_key::text, 0)
  );

  select project.* into v_project
  from public.partner_projects project
  where project.partner_id = p_partner_id
    and project.request_key = p_request_key;
  if found then
    if v_project.name <> v_name or coalesce(v_project.description, '') <> coalesce(v_description, '') then
      raise exception using errcode = '22023', message = 'Request key was already used for another project payload.';
    end if;
    return v_project;
  end if;

  insert into public.partner_projects(
    partner_id, name, description, created_by, request_key
  ) values (
    p_partner_id, v_name, v_description, v_actor, p_request_key
  ) returning * into v_project;

  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_partner_id,
    v_actor,
    'project_created',
    'project',
    v_project.id::text,
    jsonb_build_object('name', v_project.name, 'request_key', p_request_key)
  );

  return v_project;
end;
$$;

create or replace function public.partner_update_project_progress(
  p_project_id uuid,
  p_progress integer,
  p_note text,
  p_request_key uuid
)
returns public.partner_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_project public.partner_projects%rowtype;
  v_existing public.partner_project_progress%rowtype;
  v_next_status public.partner_project_status;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Partner sign-in is required.';
  end if;
  if p_request_key is null then
    raise exception using errcode = '22023', message = 'Request key is required.';
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    raise exception using errcode = '22023', message = 'Project progress must be between 0 and 100.';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'Progress note cannot exceed 1000 characters.';
  end if;

  select project.* into v_project
  from public.partner_projects project
  where project.id = p_project_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Partner project not found.';
  end if;
  if not private.can_manage_partner(v_project.partner_id) then
    raise exception using errcode = '42501', message = 'Partner project management access is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-project-progress:' || v_project.partner_id::text || ':' || p_request_key::text, 0)
  );

  select progress_row.* into v_existing
  from public.partner_project_progress progress_row
  where progress_row.partner_id = v_project.partner_id
    and progress_row.request_key = p_request_key;
  if found then
    if v_existing.project_id <> p_project_id
       or v_existing.progress <> p_progress
       or coalesce(v_existing.note, '') <> coalesce(v_note, '') then
      raise exception using errcode = '22023', message = 'Request key was already used for another progress payload.';
    end if;
    return v_project;
  end if;

  v_next_status := case
    when p_progress >= 100 then 'completed'::public.partner_project_status
    when p_progress > 0 and v_project.status = 'planned'::public.partner_project_status
      then 'active'::public.partner_project_status
    else v_project.status
  end;

  update public.partner_projects
  set progress = p_progress::smallint,
      status = v_next_status,
      updated_at = now()
  where id = p_project_id
  returning * into v_project;

  insert into public.partner_project_progress(
    partner_id, project_id, progress, note, created_by, request_key
  ) values (
    v_project.partner_id, p_project_id, p_progress::smallint, v_note, v_actor, p_request_key
  );

  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_project.partner_id,
    v_actor,
    'project_progress_updated',
    'project',
    p_project_id::text,
    jsonb_build_object('progress', p_progress, 'status', v_next_status, 'request_key', p_request_key)
  );

  return v_project;
end;
$$;

create or replace function public.partner_register_document(
  p_partner_id uuid,
  p_project_id uuid,
  p_folder_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_request_key uuid
)
returns public.partner_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_file_name text := btrim(coalesce(p_file_name, ''));
  v_storage_path text := btrim(coalesce(p_storage_path, ''));
  v_mime_type text := nullif(btrim(coalesce(p_mime_type, '')), '');
  v_document public.partner_documents%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Partner sign-in is required.';
  end if;
  if not private.can_manage_partner(p_partner_id) then
    raise exception using errcode = '42501', message = 'Partner document management access is required.';
  end if;
  if p_request_key is null then
    raise exception using errcode = '22023', message = 'Request key is required.';
  end if;
  if char_length(v_file_name) < 1 or char_length(v_file_name) > 255 then
    raise exception using errcode = '22023', message = 'Document file name must contain 1 to 255 characters.';
  end if;
  if char_length(v_storage_path) < 1 or char_length(v_storage_path) > 1000
     or v_storage_path not like p_partner_id::text || '/%' then
    raise exception using errcode = '22023', message = 'Document storage path must be organization scoped.';
  end if;
  if p_size_bytes is not null and p_size_bytes < 0 then
    raise exception using errcode = '22023', message = 'Document size cannot be negative.';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.partner_projects project
    where project.id = p_project_id and project.partner_id = p_partner_id
  ) then
    raise exception using errcode = '22023', message = 'Project does not belong to the Partner organization.';
  end if;
  if p_folder_id is not null and not exists (
    select 1 from public.partner_folders folder
    where folder.id = p_folder_id and folder.partner_id = p_partner_id
  ) then
    raise exception using errcode = '22023', message = 'Folder does not belong to the Partner organization.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-document-register:' || p_partner_id::text || ':' || p_request_key::text, 0)
  );

  select document.* into v_document
  from public.partner_documents document
  where document.partner_id = p_partner_id
    and document.request_key = p_request_key;
  if found then
    if v_document.storage_path <> v_storage_path
       or v_document.file_name <> v_file_name
       or v_document.project_id is distinct from p_project_id
       or v_document.folder_id is distinct from p_folder_id then
      raise exception using errcode = '22023', message = 'Request key was already used for another document payload.';
    end if;
    return v_document;
  end if;

  insert into public.partner_documents(
    partner_id,
    project_id,
    folder_id,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    uploaded_by,
    request_key
  ) values (
    p_partner_id,
    p_project_id,
    p_folder_id,
    v_file_name,
    v_storage_path,
    v_mime_type,
    p_size_bytes,
    v_actor,
    p_request_key
  ) returning * into v_document;

  insert into public.partner_activity_log(
    partner_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_partner_id,
    v_actor,
    'document_uploaded',
    'document',
    v_document.id::text,
    jsonb_build_object(
      'file_name', v_document.file_name,
      'project_id', p_project_id,
      'folder_id', p_folder_id,
      'request_key', p_request_key
    )
  );

  return v_document;
end;
$$;

revoke all on function public.partner_create_project(uuid, text, text, uuid)
  from public, anon;
revoke all on function public.partner_update_project_progress(uuid, integer, text, uuid)
  from public, anon;
revoke all on function public.partner_register_document(uuid, uuid, uuid, text, text, text, bigint, uuid)
  from public, anon;

grant execute on function public.partner_create_project(uuid, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.partner_update_project_progress(uuid, integer, text, uuid)
  to authenticated, service_role;
grant execute on function public.partner_register_document(uuid, uuid, uuid, text, text, text, bigint, uuid)
  to authenticated, service_role;

revoke insert, update on table public.partner_projects from authenticated;
revoke insert on table public.partner_project_progress from authenticated;
revoke insert on table public.partner_documents from authenticated;

commit;
