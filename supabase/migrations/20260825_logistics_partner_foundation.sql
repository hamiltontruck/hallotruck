alter type public.user_role add value if not exists 'partner';

do $$ begin create type public.partner_member_role as enum ('owner','admin','editor','viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.partner_project_status as enum ('planned','active','on_hold','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.partner_payment_status as enum ('pending','approved','paid','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.partner_document_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;

create schema if not exists private;

create table if not exists public.partner_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,40}$'),
  status text not null default 'active' check (status in ('active','suspended','archived')),
  contact_email text,
  contact_phone text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role public.partner_member_role not null default 'viewer',
  active boolean not null default true,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(partner_id,user_id)
);

create or replace function private.is_admin_or_ceo()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role::text in ('admin','ceo'));
$$;
create or replace function private.is_partner_member(p_partner_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.partner_memberships m where m.partner_id=p_partner_id and m.user_id=(select auth.uid()) and m.active);
$$;
create or replace function private.can_manage_partner(p_partner_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_admin_or_ceo() or exists(select 1 from public.partner_memberships m where m.partner_id=p_partner_id and m.user_id=(select auth.uid()) and m.active and m.member_role in ('owner','admin','editor'));
$$;
revoke all on function private.is_admin_or_ceo() from public;
revoke all on function private.is_partner_member(uuid) from public;
revoke all on function private.can_manage_partner(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin_or_ceo(), private.is_partner_member(uuid), private.can_manage_partner(uuid) to authenticated;

create table if not exists public.partner_projects (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  name text not null, description text, status public.partner_project_status not null default 'planned', progress smallint not null default 0 check(progress between 0 and 100),
  starts_on date, due_on date, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_project_progress (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  project_id uuid not null references public.partner_projects(id) on delete cascade, progress smallint not null check(progress between 0 and 100), note text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.partner_payments (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  project_id uuid references public.partner_projects(id) on delete set null, amount_etb numeric(14,2) not null check(amount_etb>=0), status public.partner_payment_status not null default 'pending',
  provider text, transaction_ref text, paid_at timestamptz, note text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_folders (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  project_id uuid references public.partner_projects(id) on delete cascade, parent_id uuid references public.partner_folders(id) on delete cascade,
  name text not null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.partner_documents (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  project_id uuid references public.partner_projects(id) on delete cascade, folder_id uuid references public.partner_folders(id) on delete set null,
  file_name text not null, storage_path text not null unique, mime_type text, size_bytes bigint check(size_bytes is null or size_bytes>=0), status public.partner_document_status not null default 'pending',
  uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_document_reviews (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  document_id uuid not null references public.partner_documents(id) on delete cascade, decision public.partner_document_status not null check(decision in ('approved','rejected')), note text,
  reviewed_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.partner_activity_log (
  id bigint generated always as identity primary key, partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.partner_messages (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  project_id uuid references public.partner_projects(id) on delete cascade, sender_id uuid not null references public.profiles(id), body text not null check(char_length(btrim(body)) between 1 and 4000), created_at timestamptz not null default now()
);

create index if not exists partner_memberships_user_partner_idx on public.partner_memberships(user_id,partner_id) where active;
create index if not exists partner_projects_partner_status_idx on public.partner_projects(partner_id,status,updated_at desc);
create index if not exists partner_payments_partner_status_idx on public.partner_payments(partner_id,status,created_at desc);
create index if not exists partner_documents_partner_status_idx on public.partner_documents(partner_id,status,created_at desc);
create index if not exists partner_activity_partner_created_idx on public.partner_activity_log(partner_id,created_at desc);
create index if not exists partner_messages_project_created_idx on public.partner_messages(partner_id,project_id,created_at desc);

alter table public.partner_organizations enable row level security;
alter table public.partner_memberships enable row level security;
alter table public.partner_projects enable row level security;
alter table public.partner_project_progress enable row level security;
alter table public.partner_payments enable row level security;
alter table public.partner_folders enable row level security;
alter table public.partner_documents enable row level security;
alter table public.partner_document_reviews enable row level security;
alter table public.partner_activity_log enable row level security;
alter table public.partner_messages enable row level security;

create policy partner_org_select on public.partner_organizations for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(id));
create policy partner_org_admin_write on public.partner_organizations for all to authenticated using (private.is_admin_or_ceo()) with check (private.is_admin_or_ceo());
create policy partner_members_select on public.partner_memberships for select to authenticated using (private.is_admin_or_ceo() or user_id=(select auth.uid()) or private.is_partner_member(partner_id));
create policy partner_members_admin_write on public.partner_memberships for all to authenticated using (private.is_admin_or_ceo()) with check (private.is_admin_or_ceo());
create policy partner_projects_select on public.partner_projects for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_projects_write on public.partner_projects for all to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_progress_select on public.partner_project_progress for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_progress_write on public.partner_project_progress for all to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_payments_select on public.partner_payments for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_payments_write on public.partner_payments for all to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_folders_select on public.partner_folders for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_folders_write on public.partner_folders for all to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_documents_select on public.partner_documents for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_documents_write on public.partner_documents for all to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_reviews_select on public.partner_document_reviews for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_reviews_write on public.partner_document_reviews for all to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_activity_select on public.partner_activity_log for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_activity_insert on public.partner_activity_log for insert to authenticated with check (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_messages_select on public.partner_messages for select to authenticated using (private.is_admin_or_ceo() or private.is_partner_member(partner_id));
create policy partner_messages_insert on public.partner_messages for insert to authenticated with check ((private.is_admin_or_ceo() or private.is_partner_member(partner_id)) and sender_id=(select auth.uid()));
create policy partner_messages_delete on public.partner_messages for delete to authenticated using (private.is_admin_or_ceo() or sender_id=(select auth.uid()));

grant select,insert,update,delete on public.partner_organizations, public.partner_memberships, public.partner_projects, public.partner_project_progress, public.partner_payments, public.partner_folders, public.partner_documents, public.partner_document_reviews, public.partner_activity_log, public.partner_messages to authenticated;
grant usage,select on sequence public.partner_activity_log_id_seq to authenticated;
revoke all on public.partner_organizations, public.partner_memberships, public.partner_projects, public.partner_project_progress, public.partner_payments, public.partner_folders, public.partner_documents, public.partner_document_reviews, public.partner_activity_log, public.partner_messages from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('partner-documents','partner-documents',false,52428800,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false;
create policy partner_storage_select on storage.objects for select to authenticated using (bucket_id='partner-documents' and (private.is_admin_or_ceo() or private.is_partner_member(((storage.foldername(name))[1])::uuid)));
create policy partner_storage_insert on storage.objects for insert to authenticated with check (bucket_id='partner-documents' and private.can_manage_partner(((storage.foldername(name))[1])::uuid));
create policy partner_storage_update on storage.objects for update to authenticated using (bucket_id='partner-documents' and private.can_manage_partner(((storage.foldername(name))[1])::uuid)) with check (bucket_id='partner-documents' and private.can_manage_partner(((storage.foldername(name))[1])::uuid));
create policy partner_storage_delete on storage.objects for delete to authenticated using (bucket_id='partner-documents' and private.can_manage_partner(((storage.foldername(name))[1])::uuid));

do $$ declare t text; begin
  foreach t in array array['partner_projects','partner_project_progress','partner_payments','partner_documents','partner_document_reviews','partner_activity_log','partner_messages'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
end $$;
