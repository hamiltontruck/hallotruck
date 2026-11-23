# HALLO Customer V4 — non-hardware software acceptance (24 November 2026)

## Scope and release rules

This is a QA-only/read-only acceptance record for Customer V4. Hardware GPS and a physical tracker are deliberately out of scope. Do not mutate production Supabase, PostHog retention, OAuth credentials, Sentry project settings, Driver V4, or main; do not merge/deploy without separate owner authorization.

The code integration is already in main through release PR #544 (merge `33b82d8187a0ae82549aa08befb4d79c35de133b`). Follow-up cargo PR #545 (main `37f6ca64a2f23e8cee1b788d24bdcdd66b777175`) is separate.

## Verified from existing GitHub CI and read-only queries

- Release PR #544: Customer typecheck, 168 tests, root CI and browser fixtures were successful. Browser fixtures cover EN/OR/AM × 320/360/390/412/430/768px. **Remote auth, quote and map are fixtures**, not live providers. Screenshot artifact: `customer-v4-release-fixture-screenshots`.
- Main after PR #545: Customer 169/169 tests PASS, GitHub Pages build and deploy workflow SUCCESS.
- PostHog project 622942, read-only check for 23 Nov 2026 UTC: 37 pageviews, 3 `login_succeeded`, 2 `login_failed`. This proves those event types reached the remote project, NOT full booking/quote event ingestion.
- Aggregate scan of `$pageview` route, `$pathname`, and `$current_url` for known `access_token`/`refresh_token` string signatures since 20 Nov 2026: 0 flagged of 38 pageviews checked (1 on 20 Nov, 37 on 23 Nov). This is a **limited pattern scan**, not an assurance about all payloads, other events, or the older reported 12 historic callback occurrences.
- Customer-related `orders`, `profiles`, `payments`, `tracking_pings` and customer-driver chat tables show RLS enabled. Reading policy definitions is not equivalent to cross-user API denial tests.
- Supabase security advisor reported unrelated/shared platform findings, including one `public.spatial_ref_sys` RLS warning and SECURITY DEFINER execution advisories. Review each against intended exposure before any correction; a lint notice alone does not prove unauthorized access.

## Proposed code under this Draft PR

- Explicit `flowType: "pkce"` for **Customer V4 browser Supabase client**; preserve session persistence, auto-refresh, `detectSessionInUrl`, and the existing namespaced storage key.
- Executable mocked-client tests assert the effective auth config; assert the callback `redirectTo` excludes the current URL query and fragment, and no duplicate manual code exchange exists in the auth component.
- This is **not** evidence that external Google login or existing sessions continue to work until an approved authenticated QA preview is exercised. Do not merge based solely on the contract tests.
- The SDK's automatic callback detection must be validated on the exact deployed base path, same-origin browser session, Google Cloud callback setup and Supabase Redirect URL allowlist. Never print authorization codes, verifier, access tokens, refresh tokens or raw callback URL into telemetry or tickets.

## Pending acceptance — non-hardware

| Gate | Required proof | Status |
|---|---|---|
| OAuth PKCE | Google sign-in and callback on isolated QA preview; login/session restore, reload, logout, second-device and failed/expired-code behavior; no duplicate exchanges | NOT VERIFIED |
| Customer/role RLS | Real authenticated QA accounts with Customer vs other role and cross-customer order/profile/payment/chat API denial, without live customer PII | NOT VERIFIED |
| Booking/service date | Authenticated (non-fixture) route→cargo→date→quote→review→save, date around Africa/Addis_Ababa midnight, RLS insert and idempotence | NOT VERIFIED |
| Real ORS/HGV and quote | Verify actual provider geometry, selected geocoder endpoints, ETB quote server calculation and network errors; no fabricated fallback | NOT VERIFIED |
| PostHog remote booking events | Sanitized `quote_created`, `order_placed`, virtual pageview; confirm actual event ingestion and no sensitive fields | PARTIAL — remote login events received |
| OAuth historical incident | Authorized privacy owner reviews prior token-like callback fragments, exposure/retention, possible revocation; do not copy credentials or erase history automatically | NOT VERIFIED |
| Sentry QA monitoring | Separate Customer V4 Sentry project, public DSN in QA env only, synthetic error ingestion, redacted event payload, recovery UI, access/retention | NOT VERIFIED |
| Browser/UX QA | Real authenticated test in 320–430px plus tablet; visual, keyboard/safe-area, EN/OR/AM | PARTIAL — 18 fixture cases PASS |
| Driver hardware GPS | ST-906L physical fix/ingestion; excluded from this document | EXCLUDED |

## Safe QA procedure

1. Use a pre-approved **isolated QA account** and preview, not real customer credentials or production mutations. Verify exact Supabase project and redirect allowlist before starting.
2. Run full Customer CI + root CI on the exact Draft PR head.
3. In a browser on the approved QA host, trace login from Google → Supabase → Customer callback, with secrets masked. Verify tokens never enter analytics or logging.
4. Validate deny/allow paths and booking saves using an isolated QA backend only, then capture redacted request result status codes and route summaries.
5. Observe approved synthetic PostHog and Sentry telemetry in their remote projects. Inspect **counts and sanitized field names** in reports; never export token-containing payload values.
6. Privacy owner decides historical exposure/remediation and provides separate sign-off. Only after every relevant gate has actual evidence can the owner approve merge/release.

## Links

- GitHub: #533 authenticated device/live-map; #535 OAuth privacy; #537 workflow analytics; PR #544 integration; PR #545 cargo; QA-only Draft PKCE PR from this branch.
- Jira: JMA-10 QA, JMA-11 Sentry, JMA-12 OAuth security, JMA-13 service date. Keep open until the acceptance evidence exists.
