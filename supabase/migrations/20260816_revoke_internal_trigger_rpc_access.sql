do $$
begin
  if to_regprocedure('public.enforce_delivery_proof_before_delivered()') is not null then
    execute 'revoke all on function public.enforce_delivery_proof_before_delivered() from public, anon, authenticated';
  end if;
end $$;

revoke all on function public.touch_truck_maintenance_record()
from public, anon, authenticated;

revoke all on function public.sync_truck_odometer_from_maintenance()
from public, anon, authenticated;

notify pgrst, 'reload schema';
