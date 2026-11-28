# Admin-managed GPS linking

The user requires ordinary Admins to register a GPS-to-truck association inside
HALLO, rather than depending on a one-off operator SQL change. Extend the existing
PR #550 implementation and current Fleet page; no separate application is needed.

The Admin chooses a registered plate, with assigned driver shown alongside it,
enters the existing Traccar device's 15-digit identifier and saves. A truck card
also opens the same form with that truck selected. Already-linked trucks cannot
be silently replaced. Saved identifiers are displayed on Admin Fleet after a
refresh. Duplicate devices and unknown trucks are rejected server-side. Admin/CEO
authorization and actor-attributed fleet audit are mandatory.

A one-off database update would not meet the request. A complete Traccar account
and remote device provisioning console would require unavailable scoped server
credentials and introduce a different scope. The implementation here manages
the HALLO association for an already registered Traccar device. It does not send
SMS configuration, provision remote Traccar devices, or manufacture live GPS fixes.

Use existing React/TypeScript UI, Supabase RLS-protected reads and the audited
admin_link_fleet_gps RPC. Keep Finance/Live trips separation unchanged. Preserve
actual device identifiers as strings. Never place Traccar credentials in the
frontend. Verify browser selection, save failure/retry, persisted reads and DB
role/uniqueness/audit behavior before release.
