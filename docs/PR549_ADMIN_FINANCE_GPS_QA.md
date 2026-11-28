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
- 21 disposable PGlite authorization, validation, uniqueness and audit assertions.
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
