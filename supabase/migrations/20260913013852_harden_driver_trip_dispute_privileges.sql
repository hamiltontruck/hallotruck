-- Keep direct authenticated access to driver trip disputes read-only.
-- All writes must pass through the guarded SECURITY DEFINER RPCs.

begin;

revoke all privileges on table public.driver_trip_disputes from authenticated;
grant select on table public.driver_trip_disputes to authenticated;

commit;
