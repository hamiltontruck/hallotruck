-- Keep auth JWT role claims aligned with the authoritative public.profiles role.
-- Existing RLS policies and frontend role routing read app_metadata.role.

create or replace function public.handle_new_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role public.user_role;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' = 'customer'
      then 'customer'::public.user_role
    else 'driver'::public.user_role
  end;

  insert into public.profiles (
    id,
    role,
    full_name,
    phone,
    driver_status
  )
  values (
    new.id,
    requested_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, requested_role::text), '@', 1)
    ),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
      new.id::text
    ),
    case
      when requested_role = 'driver'::public.user_role
        then 'pending'::public.driver_status
      else null
    end
  )
  on conflict (id) do nothing;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', requested_role::text)
  where id = new.id;

  return new;
end;
$$;

-- Backfill all existing accounts from the authoritative profile role.
update auth.users as u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', p.role::text)
from public.profiles as p
where p.id = u.id
  and coalesce(u.raw_app_meta_data ->> 'role', '') is distinct from p.role::text;

revoke all on function public.handle_new_driver() from public, anon, authenticated;
