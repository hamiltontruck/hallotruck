-- Secure Customer profile avatar contract.
-- Private Storage only; each authenticated Customer is restricted to their own UID folder.

alter table public.profiles
  add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  'Private customer-avatars storage object path. Never store a public URL here.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-avatars',
  'customer-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.is_customer_account()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'customer'
  );
$$;

revoke all on function private.is_customer_account() from public;
revoke all on function private.is_customer_account() from anon;
grant execute on function private.is_customer_account() to authenticated;

drop policy if exists "customer avatar own read" on storage.objects;
drop policy if exists "customer avatar own insert" on storage.objects;
drop policy if exists "customer avatar own update" on storage.objects;
drop policy if exists "customer avatar own delete" on storage.objects;

create policy "customer avatar own read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and private.is_customer_account()
);

create policy "customer avatar own insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar.jpg'
  and private.is_customer_account()
);

create policy "customer avatar own update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'customer-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar.jpg'
  and private.is_customer_account()
)
with check (
  bucket_id = 'customer-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar.jpg'
  and private.is_customer_account()
);

create policy "customer avatar own delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar.jpg'
  and private.is_customer_account()
);

-- Keep the legacy RPC untouched for existing clients. Android uses v2 for avatar-aware reads.
create or replace function public.customer_get_profile_v2()
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  home_address text,
  customer_type text,
  company_name text,
  avatar_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Customer session expired.' using errcode = '28000';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.home_address,
    coalesce(p.customer_type, 'individual')::text,
    p.company_name,
    p.avatar_path,
    p.created_at
  from public.profiles p
  where p.id = v_user_id
    and p.role::text = 'customer'
  limit 1;
end;
$$;

revoke all on function public.customer_get_profile_v2() from public;
revoke all on function public.customer_get_profile_v2() from anon;
grant execute on function public.customer_get_profile_v2() to authenticated;

create or replace function public.customer_set_avatar(p_avatar_path text)
returns text
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_path text := btrim(coalesce(p_avatar_path, ''));
begin
  if v_user_id is null then
    raise exception 'Customer session expired.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role::text = 'customer'
  ) then
    raise exception 'Customer access only.' using errcode = '42501';
  end if;

  if v_path <> v_user_id::text || '/avatar.jpg' then
    raise exception 'Invalid customer avatar path.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'customer-avatars'
      and o.name = v_path
      and o.owner_id = v_user_id::text
  ) then
    raise exception 'Customer avatar upload was not found.' using errcode = 'P0002';
  end if;

  update public.profiles
  set avatar_path = v_path
  where id = v_user_id
    and role::text = 'customer';

  if not found then
    raise exception 'Customer profile not found.' using errcode = 'P0002';
  end if;

  return v_path;
end;
$$;

revoke all on function public.customer_set_avatar(text) from public;
revoke all on function public.customer_set_avatar(text) from anon;
grant execute on function public.customer_set_avatar(text) to authenticated;

create or replace function public.customer_clear_avatar()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Customer session expired.' using errcode = '28000';
  end if;

  update public.profiles
  set avatar_path = null
  where id = v_user_id
    and role::text = 'customer';

  if not found then
    raise exception 'Customer profile not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.customer_clear_avatar() from public;
revoke all on function public.customer_clear_avatar() from anon;
grant execute on function public.customer_clear_avatar() to authenticated;

notify pgrst, 'reload schema';
