create or replace function public.customer_get_profile()
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  home_address text,
  customer_type text,
  company_name text,
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
    p.created_at
  from public.profiles p
  where p.id = v_user_id
    and p.role::text = 'customer'
  limit 1;
end;
$$;

revoke all on function public.customer_get_profile() from public;
revoke all on function public.customer_get_profile() from anon;
grant execute on function public.customer_get_profile() to authenticated;

notify pgrst, 'reload schema';
