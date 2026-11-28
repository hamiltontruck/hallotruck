# Admin GPS registration and linking

Admin → Fleet → Link GPS selects a registered vehicle by plate and driver and
saves its existing Traccar device identifier. Vehicle cards open the form with
the current plate selected. Linked identifiers are read back from the existing
RLS-protected trucks table and shown on the Admin card. Already linked vehicles
are excluded; replacing devices is not silently permitted.

The Admin/CEO-only RPC normalizes plates, validates the 15-digit identifier,
locks the truck and prevents reuse of the device. Identical retries are
idempotent. A new association writes an actor-attributed fleet audit event in
the same transaction, storing only the identifier’s final four digits in audit metadata. The flow uses no Traccar password or browser-side secret.

This is HALLO device-to-truck registration, for devices already registered in
Traccar. It does not create remote Traccar devices, send configuration SMS,
activate SIMs or synthesize valid location fixes. Current Live trips data sources
are unchanged. Saving the association does not imply live telemetry ingestion.

Verification:
- 22 disposable PGlite authorization, validation, uniqueness and audit assertions.
- Real React/Chromium browser checks for registered plate/driver selection,
  linked-device display, existing-link exclusion, per-card preselection, invalid
  IMEI, server rejection/retry and RPC arguments. External requests are blocked.
- Finance/Live trips separation and successful asynchronous payment form checks.
- Lint, build and complete business regression suite passed locally.

Production prerequisite applied on 2026-11-28: admin_link_fleet_gps migration.
The unique index is valid, anon execute permission is denied, authenticated
execute permission is granted, and the function uses an empty search_path plus
server-side active Admin/CEO authorization. A live unauthenticated negative test
was rejected before any truck mapping write. No actual device/truck association
was selected or changed by the assistant; ordinary Admins perform that action
through the app. HALLO GPS QA was not modified.

Migration filenames match the versions recorded by Supabase during this release:
20261128015726 (link RPC/index) and 20261128015948 (forward audit masking fix).
Fresh installations apply the masking forward fix before Admins use the UI.
The local CLI could not initialize its read-only home profile; filenames therefore
use the actual server-generated migration versions rather than guessed times.

Supabase advisors report the new authenticated SECURITY DEFINER endpoint as
expected for this privileged RPC. Its explicit active Admin/CEO check, empty
search_path and anon denial were verified. Existing unrelated advisories were
left unchanged. Advisory reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
