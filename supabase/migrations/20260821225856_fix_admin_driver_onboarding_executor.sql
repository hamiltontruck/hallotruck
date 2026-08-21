-- The Admin/CEO approval RPC must update protected profile and truck rows.
-- Its body performs the leadership-role check before any privileged work.
alter function public.admin_approve_driver_onboarding(uuid) security definer;

revoke all on function public.admin_approve_driver_onboarding(uuid) from public, anon;
grant execute on function public.admin_approve_driver_onboarding(uuid) to authenticated;
