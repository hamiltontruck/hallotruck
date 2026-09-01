-- Partner job request mutations must remain RPC-only.
-- Authenticated clients may read RLS-filtered rows, but receive no table-level mutation or maintenance privileges.
revoke all on table public.partner_job_requests from authenticated;
grant select on table public.partner_job_requests to authenticated;
