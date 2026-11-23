# Customer V4 reviewed integration — 23 November 2026

This integration combines #534, #536, #538, #539, #540, #542 and #543 without changing Supabase schema, RLS, pricing rules, Driver V4 or production records. The repository owner explicitly requested fixes, tests and merge after being told real Android/GPS and external authenticated QA were still outstanding.

The merge preserves all original heads. Conflicts in the active booking journey and order service retain detailed cargo selection, service-date checks and analytics instrumentation together. Previously fixed regressions remain covered: trusted PostHog project token reconstruction, final pre-insert Ethiopia-midnight date revalidation and allowlisted Sentry QA environment retention.

## Verified on the combined source

- Customer app: typecheck, 168 tests and Vite production build pass.
- Root lint and regression suite pass; GitHub CI runs the complete root build/browser suite before merge.
- `scripts/customer-v4-release-browser-test.mjs` mounts the shipping authentication boundary, booking journey, date/cargo rules, order insertion service and analytics sanitizer. Only remote providers are local fixtures.
- Android browser emulation exercises EN/OR/AM at 320, 360, 390, 412, 430 and 768 CSS pixels: rejected password then successful customer login, admin denial, invalid date blocking, category/item reset, Back/Next selection retention, read-only review date, persisted order contract and controlled telemetry events.
- All 18 cases have no page errors or horizontal overflow. Synthetic review screenshots are retained by the CI artifact `customer-v4-release-fixture-screenshots`. The Oromo 320px screenshot was visually inspected.
- Actual Sentry BrowserClient local transport tests verify QA/staging environment and filtered outgoing envelopes; PostHog runtime tests verify sanitized payloads and trusted token. No external telemetry is sent by these tests.

## Limits that remain after merge

Browser emulation is not a physical Android device test. Local fixture authentication is not an external OAuth/session/RLS acceptance test. Fixture routes/quotes do not establish live ORS/HGV or pricing availability. No actual GPS source, heading or live-map marker was observed; no synthetic GPS is presented as real evidence. Remote PostHog/Sentry ingestion, historical telemetry privacy-owner decisions and full device/live-service acceptance remain tracked by #533, #535 and #537. Do not close these gates solely because CI passes.

Sentry remains opt-in for QA/staging only. The GPS runner is manual, protected-main-only, credential-free and has no writer/ingestion job; merging it does not execute it or activate hardware GPS credentials.
