# Admin hardware GPS

`admin-hardware-gps` is a read-only bridge from the existing Traccar QA service into HALLO Admin Live trips. It does not write positions, change trip status, create bookings, or touch payments. Customer and Driver tracking retain their current data sources.

Configure `TRACCAR_API_TOKEN` in the Supabase project's Edge Function secrets using the Traccar read-only account. Keep the token out of Vite variables and browser code. The upstream origin is fixed in the server entrypoint. A HALLO authenticated JWT is checked with `auth.getUser`; the server profile must be an active Admin or CEO. JWT gateway verification is disabled because the function performs this authentication itself.

Admin links a registered vehicle under Fleet maintenance. The bridge loads that mapping from the database and returns only requested linked truck positions, never the full Traccar device list or device identifiers. The UI polls up to 20 active assigned vehicles every eight seconds, prioritizing the selected trip. Select a trip outside that first batch to load its GPS.

Only valid GT06/H02 fixes with bounded coordinates, speed and timestamps are used. Knots are converted to km/h. GPS age uses the original fix time: LIVE through two minutes, STALE through thirty minutes, then OFFLINE. A newer Driver app position takes precedence over older hardware GPS. Hardware GPS does not establish driver availability. When the bridge fails, the UI clears its hardware snapshot and explicitly shows the Driver app fallback message.

## Release verification

- Run `node scripts/admin-hardware-gps-test.mjs` and `node scripts/admin-hardware-gps-browser-test.mjs`, lint, regression, build and smoke checks.
- Deploy the function before publishing the frontend. An unauthenticated POST must return 401 without returning GPS data.
- Sign into HALLO with a real Admin account, open Live trips and select the vehicle linked to C32. Confirm Hardware GPS, speed, heading and original fix time agree with Traccar. This final authenticated hardware check requires the operator's session; fixture tests do not establish it.
- Upstream missing token, revoked token, network failures and malformed responses return a sanitized 503. The Railway free service may cold-start; retry rather than changing GPS timestamps or reporting a stale fix as LIVE.

## Diagnosing a connection failure

Safe server logs identify only the failing phase, the upstream endpoint name and HTTP status, or exception class. They never include credentials, response bodies, coordinates or device identifiers. The startup token-format category identifies URL/prefix/quote/whitespace mistakes without showing the secret.

Traccar HTTP 401 means the configured tracking credential was rejected. Verify the read-only account's access token and expiration, then replace `TRACCAR_API_TOKEN` directly in Edge secrets. A successful secret save confirms storage; it does not confirm that Traccar accepts the value. Do not replace it with an Admin token or disable HALLO authentication. Final success requires an authenticated Live trips request returning 200 and showing the expected hardware fix.
