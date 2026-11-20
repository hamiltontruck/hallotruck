# HALLO ST-906L hardware GPS QA skeleton

This directory is **QA only**. The offline simulator has no external calls. The optional runner connects only to the approved Railway Traccar QA origin.

## Run

```sh
node --test tools/hardware-gps-qa/adapter.test.mjs
```

The simulator emits an example **Traccar REST API position object**, not genuine SinoTrack/H02 packets. Traccar device protocols and its ST-906L firmware/port must be validated with hardware before live deployment.

The adapter accepts Traccar device/position objects plus a server-verified mapping to a HALLO truck and returns validated normalized telemetry. It converts Traccar speed from knots to km/h, rejects unknown or duplicate device mappings, invalid coordinates/speeds and old/future timestamps, and distinguishes LIVE/STALE/OFFLINE.

The standalone adapter has no TCP listener, trip linkage, tenant authorization, source arbitration, Supabase transport, or UI. The QA runner described below adds authenticated Traccar REST reads, durable local ingest, ignition state, and bounded replay. Production `record_driver_tracking_ping` can transition an accepted order to in_transit, so the hardware adapter intentionally never calls it.


## Software pilot runner

The runner uses Node.js 22+, a protected persistent SQLite file, and the
Railway Traccar QA origin `https://traccar-qa-qa.up.railway.app`. It has four
commands. `verify` and `register` can run without position data. The ingestion
commands fetch records already saved by Traccar. The read-only `verify`
command requires the device list to match the approved mapping exactly and
checks position history access for each approved device. It prints counts
and access flags only. An empty history is valid before hardware testing.
A server-side write-denial test requires a separately approved disposable QA
object and the scoped token. An authenticated read does not establish write
denial.

```sh
node tools/hardware-gps-qa/run-qa.mjs verify
node tools/hardware-gps-qa/run-qa.mjs register
node tools/hardware-gps-qa/run-qa.mjs once
node tools/hardware-gps-qa/run-qa.mjs watch
node --test tools/hardware-gps-qa/*.test.mjs
```

| Configuration | Purpose |
| --- | --- |
| `HALLO_GPS_ENV=qa` | Required for every command |
| `HALLO_GPS_MAPPINGS_FILE` | Protected file containing the approved mapping array |
| `HALLO_GPS_DB_FILE` | Protected persistent file used by `once` and `watch` |
| `TRACCAR_URL` | Optional override, restricted to the approved QA HTTPS origin |
| `TRACCAR_TOKEN` | Sealed read-only QA account token for verify and ingestion |
| `TRACCAR_REGISTRATION_TOKEN` | Separate short-lived QA operator token only for explicit registration |

Have a Traccar QA administrator create a read-only test-runner account, grant
access only to approved QA devices, keep reports enabled, and generate a
short-lived token from **Account → Token** or the authenticated
`POST /api/session/token` endpoint. Inject the token from the runner's secret
store. In Railway use a sealed variable on the QA runner, which is a different
process from the Traccar server. Use a temporary operator token for registration,
then revoke it and grant the read-only account access to the device. Never
paste tokens into a terminal command, the PR, or a fixture. Authentication
requires a real QA account even for a simulated registration.

Example mapping contents, with synthetic identifiers only:

```json
[{"uniqueId":"0012345678","name":"Synthetic ST-906L","truckId":"qa-truck"}]
```

Use the firmware-reported unique ID exactly as a string. A firmware variant
may report a shortened ID, so preserve leading zeroes and avoid deriving an
identifier from the printed IMEI. Registration resolves the remote unique ID
and creates it only when absent. An operator manages the allowlist separately
from ingestion. Treat a mapping as immutable for a pilot ledger. Use a fresh
ledger when reassigning a tracker to a different truck or changing Traccar
instances.

### Replay and status

- The worker reads each allowed device's history by fix time, rescans the
  previous 24 hours, and accepts up to five minutes of clock skew. The deployed
  Traccar report row limit must be at least 50,000. A full response is split
  into smaller windows to avoid truncation.
- Only valid H02 rows for the registered device pass. Coordinates, speed,
  heading, protocol, and timestamps are validated. Store the fix timestamp
  separately from the worker's receipt timestamp. Rows dated in the future
  stay out of the current-location view until their fix time.
- SQLite transactions retain history across process restarts. Traccar position
  ID and the device/fix-time/coordinate tuple prevent duplicate writes.
  Buffered older fixes cannot replace newer fixes. The runner retries
  transient polling errors with capped backoff. It retains seven days of
  local history and reports aggregate counts and status only.
- Status is LIVE through 60 seconds, STALE through five minutes, and OFFLINE
  afterward or when the device has no usable fix. Run one QA worker against
  one protected ledger. The recovery window bounds replay coverage.

### H02 software evidence

The archived Traccar 6.16.0 code maps H02 to TCP port 5013. Its upstream
decoder tests exercise ASCII and binary H02 fixtures. CI runs those fixture
tests against upstream Traccar and runs the HALLO REST pipeline separately
with synthetic Traccar positions. This establishes coverage of the cited
decoder and adapter, while the installed Railway version and the ST-906L
firmware must be identified during actual acceptance.

- [Traccar port mapping](https://github.com/traccar/traccar/blob/v6.16.0/src/main/java/org/traccar/config/PortConfigSuffix.java)
- [Traccar H02 decoder fixtures](https://github.com/traccar/traccar/blob/v6.16.0/src/test/java/org/traccar/protocol/H02ProtocolDecoderTest.java)
- [Traccar positions history endpoint](https://github.com/traccar/traccar/blob/v6.16.0/src/main/java/org/traccar/api/resource/PositionResource.java)

### Supabase staging preparation

`staging/install.sql` is an opt-in SQL artifact outside the application
migration path. Apply only to disposable PostgreSQL or the confirmed **HALLO GPS QA** project
`rmnjhdlbhfcmlvzqtblm` after explicit SQL approval. Seed synthetic QA mappings
through the staging administrator. `staging/prepare-writer.sql` prepares the
disabled `hallo_gps_qa_ingest` role with membership in `hallo_gps_qa_writer`.
Both setup scripts are transactional and repeat safely for managed objects.
They refuse unmanaged schema or role name collisions. The writer can
read approved mappings and insert telemetry with `ON CONFLICT DO NOTHING`.
Database constraints enforce the exact mapping and telemetry checks. The
schema has no public grants, enables RLS, and stays outside the Data API's
exposed schemas. `staging/test.sql` uses synthetic values and verifies
permissions and deduplication in a rollback-only transaction. The optional PostgreSQL exporter reads the runner's local SQLite ledger.
It filters by the approved device/truck mapping and sends bounded transactions
under the dedicated writer login. Each run resubmits retained history, so a
lost response or failed batch can be retried. PostgreSQL ignores duplicates
and stores the original fix and receipt timestamps. The ledger retains
seven days of history.

Use the project-specific **Session Pooler** hostname shown in
**HALLO GPS QA → Connect → Session pooler**. The exporter pins
`aws-1-eu-central-1.pooler.supabase.com:5432` along with the QA project ref. The restricted pooler
username is `hallo_gps_qa_ingest.rmnjhdlbhfcmlvzqtblm`. The connection uses
`sslmode=verify-full` and the checked-in public Supabase Root 2021 CA.
The [Supabase CA download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)
is pinned by SHA-256 fingerprint in the guard tests. Direct hosts, transaction
pooler ports, other projects and other usernames are rejected.

### Protected manual connectivity checks

After review, the manual workflow must be present on the repository's
default branch before dispatch. In **Settings → Environments**, prepare
`hallo-gps-qa`, add a required reviewer, prevent self-review, and allow
deployments only from the `main` branch. Then use the workflow's default
mode for a credential-free IPv4 and TLS probe. Only after separate writer
activation approval, store the temporary writer password as the environment
secret `HALLO_GPS_QA_WRITER_PASSWORD` and select **verify_writer** for the
read-only authentication check. The secret is injected only into that step.
The workflow has no pull request trigger and runs only against this
repository's default branch. It has no ingestion step.

The separately approved synthetic ingestion procedure uses a protected runner
with PostgreSQL client 16 or newer. Set `HALLO_GPS_ENV=qa`,
`HALLO_GPS_STAGING_PROJECT_REF=rmnjhdlbhfcmlvzqtblm`, `PGPORT=5432`,
`PGHOST=aws-1-eu-central-1.pooler.supabase.com`, and
`PGUSER=hallo_gps_qa_ingest.rmnjhdlbhfcmlvzqtblm`. Supply `PGPASSWORD`
from the secret store and the protected mapping and SQLite ledger paths.

```sh
node tools/hardware-gps-qa/staging/run.mjs
```

CI exercises the SQLite-to-PostgreSQL SQL on a disposable PostgreSQL service
using synthetic telemetry. Live staging authentication and ingestion require
separate approval.

### Remaining physical acceptance

1. Record the purchased ST-906L firmware variant and its actual protocol and
   unique ID. Register it on the QA server and confirm the reader account sees
   the expected name and only its approved devices.
2. Install an active SIM, verify APN and network support, and configure the
   Railway QA TCP endpoint. Capture redacted evidence of the QA Traccar H02
   decode and a fresh valid GPS fix from the hardware.
3. Verify real moving and stationary fixes and the ignition state where the
   hardware supports it. Compare fix timestamps, location, speed, and heading.
4. Interrupt and restore cellular connectivity. Check the LIVE, STALE, and
   OFFLINE thresholds, delivery of buffered fixes with original timestamps,
   deduplication after a runner restart, and recovery to LIVE.
5. Confirm the QA integration never invokes a trip transition, and confirm
   staging authorization before any HALLO integration is considered ready.

Simulated software results do not establish radio, SIM, firmware, or
real-device compatibility.
