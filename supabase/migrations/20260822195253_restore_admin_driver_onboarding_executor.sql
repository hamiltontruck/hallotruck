-- Restore the Admin/CEO onboarding approval endpoint after RPC hardening.
-- The function remains protected by its internal app_metadata role check.

revoke all on function public.admin_approve_driver_onboarding(uuid) from public, anon;
grant execute on function public.admin_approve_driver_onboarding(uuid) to authenticated;

notify pgrst, 'reload schema';
