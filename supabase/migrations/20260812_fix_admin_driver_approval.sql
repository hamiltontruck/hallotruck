-- Allow Admin/CEO to approve or reject driver profiles without opening broad profile editing.
-- The UI already updates only driver_status; RLS previously allowed only self-updates,
-- so Admin approval appeared to do nothing / failed.

create or replace function public.guard_leadership_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce(auth.jwt()->'app_metadata'->>'role', '');
begin
  -- Preserve normal self-profile edits governed by the existing self-update RLS policy.
  if auth.uid() = old.id then
    return new;
  end if;

  if v_actor_role in ('admin', 'ceo') then
    if old.role::text <> 'driver' or new.role::text <> 'driver' then
      raise exception 'Leadership may only change driver approval status through this profile update path';
    end if;

    -- Leadership approval is intentionally limited to driver_status only.
    if new.id is distinct from old.id
      or new.full_name is distinct from old.full_name
      or new.phone is distinct from old.phone
      or new.vehicle_type is distinct from old.vehicle_type
      or new.rating_avg is distinct from old.rating_avg
      or new.created_at is distinct from old.created_at
      or new.email is distinct from old.email
      or new.home_address is distinct from old.home_address
      or new.customer_type is distinct from old.customer_type
      or new.company_name is distinct from old.company_name
    then
      raise exception 'Admin approval may only change driver_status';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_leadership_update_guard on public.profiles;
create trigger profiles_leadership_update_guard
before update on public.profiles
for each row execute function public.guard_leadership_profile_update();

drop policy if exists "profiles: leadership driver status update" on public.profiles;
create policy "profiles: leadership driver status update"
  on public.profiles
  for update
  to authenticated
  using (
    role::text = 'driver'
    and coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin', 'ceo')
  )
  with check (
    role::text = 'driver'
    and coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin', 'ceo')
    and driver_status in (
      'pending'::public.driver_status,
      'approved'::public.driver_status,
      'rejected'::public.driver_status,
      'suspended'::public.driver_status
    )
  );
