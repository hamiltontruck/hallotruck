begin;

revoke all on function public.driver_save_vehicle_profile(text, text, numeric) from public, anon;
grant execute on function public.driver_save_vehicle_profile(text, text, numeric) to authenticated;

notify pgrst, 'reload schema';

commit;
