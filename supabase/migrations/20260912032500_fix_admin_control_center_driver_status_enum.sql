-- Fix Admin/CEO Overview crash caused by coalescing the driver_status enum with an empty string.
-- Empty string is not a valid public.driver_status enum value, so PostgreSQL attempted to cast ''
-- to the enum before LOWER() could run. Cast the enum to text before COALESCE instead.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_control_center_v2_report()'::regprocedure)
    into v_definition;

  if position('coalesce(p.driver_status, '''')' in v_definition) = 0 then
    raise exception 'Expected driver_status enum coalesce pattern was not found in admin_control_center_v2_report()';
  end if;

  v_definition := replace(
    v_definition,
    'coalesce(p.driver_status, '''')',
    'coalesce(p.driver_status::text, '''')'
  );

  execute v_definition;
end;
$$;

revoke all on function public.admin_control_center_v2_report() from public, anon;
grant execute on function public.admin_control_center_v2_report() to authenticated;
