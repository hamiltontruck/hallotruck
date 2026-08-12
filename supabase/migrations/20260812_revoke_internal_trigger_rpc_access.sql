-- Security hardening for internal trigger-only functions.
-- These functions are invoked by database triggers and must not be callable directly
-- through PostgREST RPC by anonymous or authenticated clients.

revoke all on function public.archive_driver_verification_version() from public, anon, authenticated;
revoke all on function public.guard_leadership_profile_update() from public, anon, authenticated;
revoke all on function public.sync_cash_driver_commission_charge() from public, anon, authenticated;
revoke all on function public.sync_order_payment_status_trigger() from public, anon, authenticated;

-- Trigger execution does not require client EXECUTE privilege, so existing document
-- history, commission synchronization, profile approval guard, and payment-status
-- synchronization continue to run from their database triggers.
