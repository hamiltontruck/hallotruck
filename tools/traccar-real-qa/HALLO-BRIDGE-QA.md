# HALLO–Traccar hardware GPS bridge (QA-only)
This is a **read-only adapter prototype**, not a deployed Supabase or Admin integration. It extends PR #529's real Traccar API client on a separate dependent branch.

Flow: ST-906L (verified protocol and SIM required) -> Railway Traccar TCP receiver -> authenticated Traccar REST API -> `latestAuthorized` device/truck mapping -> `readHalloTruckLocation` -> proposed Admin fleet map DTO.

The canonical truck row in `public.trucks` supplies `id`, `plate_number`, `gps_provider='traccar'`, and `gps_external_id` (Traccar device unique ID). Use a privileged **server-only** reader scoped to vehicles Admin is allowed to view. Never put Traccar credentials, service-role secrets or this privileged client in the Vite browser bundle.

No writes to `tracking_pings`: existing `record_driver_tracking_ping` is for authenticated assigned drivers. No auto-start of orders; hardware GPS must not impersonate a driver. Staging-specific ingestion with source authentication, anti-replay, tenant isolation and RLS requires a separate design and approval.

Local tests (synthetic fixture data **in unit tests only**):
```sh
node --test tools/traccar-real-qa/hallo-bridge.test.mjs
```
Hardware validation remains pending until a real device provides authenticated API positions with fresh fixes, ignition and reconnect tests. GPS positions and device identifiers must not be logged. Do not merge/deploy to production.
