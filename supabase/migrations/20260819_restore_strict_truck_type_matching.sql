-- Restore strict vehicle-type matching across customer matching, Admin dispatch,
-- and driver self-assignment. Capacity remains a separate >= load check.
create or replace function public.truck_type_can_fulfill(
  p_requested_type text,
  p_offered_type text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select lower(btrim(p_offered_type)) = lower(btrim(p_requested_type));
$$;

revoke all on function public.truck_type_can_fulfill(text, text) from public, anon;
grant execute on function public.truck_type_can_fulfill(text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
