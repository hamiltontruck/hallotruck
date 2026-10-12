begin;
set local search_path=public,pg_catalog;
-- Policies retain function OIDs after ALTER FUNCTION SET SCHEMA/RENAME. Reparse
-- their original expressions through the guarded public wrappers; never grant
-- authenticated execution on the unguarded private implementations.
do $$
declare p record; v_using text; v_check text;
begin
 for p in select n.nspname,c.relname,pol.polname,
  pg_get_expr(pol.polqual,pol.polrelid) as using_expression,
  pg_get_expr(pol.polwithcheck,pol.polrelid) as check_expression
  from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' loop
  v_using:=replace(replace(replace(p.using_expression,
   'private.hallo_available_order_core(', 'public.driver_can_view_available_order('),
   'private.hallo_order_visibility_v2_core(', 'public.driver_can_view_available_order_v2('),
   'private.hallo_order_visibility_v2_calendar_core(', 'public.driver_can_view_available_order_v2_calendar_unchecked_20260927(');
  v_check:=replace(replace(replace(p.check_expression,
   'private.hallo_available_order_core(', 'public.driver_can_view_available_order('),
   'private.hallo_order_visibility_v2_core(', 'public.driver_can_view_available_order_v2('),
   'private.hallo_order_visibility_v2_calendar_core(', 'public.driver_can_view_available_order_v2_calendar_unchecked_20260927(');
  if v_using is distinct from p.using_expression then
   execute format('alter policy %I on %I.%I using (%s)',p.polname,p.nspname,p.relname,v_using);
  end if;
  if v_check is distinct from p.check_expression then
   execute format('alter policy %I on %I.%I with check (%s)',p.polname,p.nspname,p.relname,v_check);
  end if;
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
