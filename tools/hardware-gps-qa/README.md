# HALLO ST-906L hardware GPS QA skeleton

This directory is **QA only**. It has no external calls, secrets, Supabase writes, migrations, driver-mobile changes or production deployment.

## Run

```sh
node --test tools/hardware-gps-qa/adapter.test.mjs
```

The simulator emits an example **Traccar REST API position object**, not genuine SinoTrack/H02 packets. Traccar device protocols and its ST-906L firmware/port must be validated with hardware before live deployment.

The adapter accepts Traccar device/position objects plus a server-verified mapping to a HALLO truck and returns validated normalized telemetry. It converts Traccar speed from knots to km/h, rejects unknown or duplicate device mappings, invalid coordinates/speeds and old/future timestamps, and distinguishes LIVE/STALE/OFFLINE.

**Not implemented:** TCP listener, real Traccar API authentication, durable ingest, ignition-event persistence, offline history/replay ordering, tenant authorization, source arbitration, trip linkage, Supabase integration or UI. Production `record_driver_tracking_ping` can transition an accepted order to in_transit, so the hardware adapter intentionally never calls it.

Next gate: run automated tests in CI, stand up local Traccar, validate REST payload shape, then build a separate server-only ingestion service in QA with strict authentication and fleet authorization. Do not connect to production Supabase.
