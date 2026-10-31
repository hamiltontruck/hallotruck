# HALLO real Traccar API — QA-only draft

Unlike PR #528, this PR does **not** generate artificial coordinates or imitate an ST-906L. It reads **actual** Traccar REST /api/devices and /api/positions from a running Traccar server. No Supabase writes, RLS/RPC changes, Driver V4 modifications or production deployment.

## Actual server smoke (not yet executed against a real endpoint)

Use an isolated authorized Traccar server and environment variables, never commit credentials:

```sh
export TRACCAR_URL=https://your-qa-traccar.example
export TRACCAR_TOKEN=your_private_user_token
node tools/traccar-real-qa/smoke.mjs
```

Or use TRACCAR_EMAIL and TRACCAR_PASSWORD instead of the token. Local HTTP is accepted only on loopback. No credentials or GPS coordinates are printed. A server with zero valid device fixes is **not** a successful hardware test.

Traccar API reference: https://www.traccar.org/api-reference/

## Pending

1. Provision and secure an actual Traccar Docker QA server and credentials outside GitHub.
2. Verify ST-906L firmware, actual tracker protocol and incoming real packets.
3. Exercise API smoke against actual hardware/SIM network; offline/recovery/ignition.
4. Design authenticated server-only ingestion and mapping with replay defense, tenant separation and order lifecycle separation.
5. Integrate into separate Supabase staging after explicit approval.

Do **not** merge this PR based only on syntax checks. No live hardware has been connected.
