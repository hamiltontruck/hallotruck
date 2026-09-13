begin;

-- Anonymous API traffic only needs the explicitly supported read/session paths.
revoke insert, update, delete on table public.orders from anon;
revoke insert, delete on table public.profiles from anon;
revoke insert, update, delete on table public.driver_documents from anon;
revoke insert, update, delete on table public.driver_verification_history from anon;
revoke insert, update, delete on table public.notifications from anon;
revoke insert, update, delete on table public.push_notification_outbox from anon;
revoke insert, update, delete on table public.push_notification_deliveries from anon;

-- These tables are read-only to authenticated API callers; writes happen through
-- guarded RPCs / service-role backend paths.
revoke insert, update, delete on table public.driver_verification_history from authenticated;
revoke insert, update, delete on table public.notifications from authenticated;
revoke insert, update, delete on table public.push_notification_outbox from authenticated;
revoke insert, update, delete on table public.push_notification_deliveries from authenticated;

-- PostGIS helper functions are not application RPC endpoints; keep them out of
-- the exposed REST execution surface without relocating the extension.
revoke execute on function public.st_estimatedextent(text, text) from public, anon, authenticated;
revoke execute on function public.st_estimatedextent(text, text, text) from public, anon, authenticated;
revoke execute on function public.st_estimatedextent(text, text, text, boolean) from public, anon, authenticated;

commit;
