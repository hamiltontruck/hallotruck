-- Phase 1: Finance Dashboard V3 access remains database-backed and denies
-- suspended profiles before any finance RLS policy or RPC can return data.

create or replace function private.is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role::text in ('admin', 'ceo')
      and coalesce(profile.driver_status::text, 'active') <> 'suspended'
  );
$$;

revoke all on function private.is_admin_or_ceo() from public, anon;
grant execute on function private.is_admin_or_ceo() to authenticated;

notify pgrst, 'reload schema';
