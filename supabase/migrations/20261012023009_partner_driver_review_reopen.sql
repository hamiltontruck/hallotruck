begin;
create function public.reopen_partner_driver_registration(p_registration_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_row public.partner_driver_registrations; v_status text;
begin
 perform private.require_active_leadership('reopen_partner_driver_registration');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Reopen reason is required'; end if;
 select * into v_row from public.partner_driver_registrations where id=p_registration_id for update;
 if not found or v_row.status<>'rejected' or v_row.driver_id is null then raise exception 'Rejected claimed registration required'; end if;
 perform private.require_partner_driver_manager(v_row.partner_id);
 select driver_status::text into v_status from public.profiles where id=v_row.driver_id and role::text='driver' for update;
 if v_status is distinct from 'pending' then raise exception 'Pending Partner driver required; reopening does not approve or restore a suspended driver'; end if;
 if not exists(select 1 from public.partner_driver_ownership where driver_id=v_row.driver_id and partner_id=v_row.partner_id and registration_id=v_row.id) then raise exception 'Matching Partner ownership required'; end if;
 if exists(select 1 from public.orders where driver_id=v_row.driver_id and status::text in ('accepted','in_transit')) then raise exception 'Resolve the active trip before reopening'; end if;
 perform set_config('app.fleet_change_source','admin',true);
 perform set_config('app.fleet_change_reason','Partner driver registration reopened for document review',true);
 update public.trucks set status='inactive',updated_at=now() where driver_id=v_row.driver_id and partner_id=v_row.partner_id;
 update public.partner_fleet_vehicles set status='inactive' where assigned_driver_id=v_row.driver_id and partner_id=v_row.partner_id;
 update public.partner_driver_registrations set status='registered',reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_reason) where id=v_row.id;
 insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_row.partner_id,auth.uid(),'partner_driver_reopened','partner_driver_registration',v_row.id::text,
 jsonb_build_object('from_status','rejected','to_status','registered','reason',btrim(p_reason)));
end $$;
revoke all on function public.reopen_partner_driver_registration(uuid,text) from public,anon;
grant execute on function public.reopen_partner_driver_registration(uuid,text) to authenticated;
commit;
notify pgrst,'reload schema';
