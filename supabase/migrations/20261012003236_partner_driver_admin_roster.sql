begin;
create function public.admin_driver_compliance_workspace(p_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_drivers jsonb; v_ids uuid[];
begin
 perform private.require_active_leadership('admin_driver_compliance_workspace');
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),coalesce(array_agg(r.id),'{}'::uuid[]) into v_drivers,v_ids from public.list_admin_driver_roster(p_scope) r;
 return jsonb_build_object('drivers',v_drivers,
  'trucks',coalesce((select jsonb_agg(to_jsonb(t)) from public.trucks t where t.driver_id=any(v_ids) or t.id in (select d.truck_id from public.driver_verification_files d where d.driver_id=any(v_ids))),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.driver_verification_files d where d.driver_id=any(v_ids)),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(to_jsonb(o)) from (select * from public.orders where driver_id=any(v_ids) order by created_at desc limit 1000) o),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p where p.order_id in (select o.id from public.orders o where o.driver_id=any(v_ids))),'[]'::jsonb));
end $$;
revoke all on function public.admin_driver_compliance_workspace(text) from public,anon;
grant execute on function public.admin_driver_compliance_workspace(text) to authenticated;
commit;
notify pgrst,'reload schema';
