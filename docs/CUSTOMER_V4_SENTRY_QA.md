# HALLO Customer Mobile V4 — Sentry QA-only integration

## Scope and isolation

This draft enables **unexpected JavaScript errors, unhandled rejections and
React render crashes** for `apps/customer-mobile-app` only. It does not
instrument the root HALLO web app, Driver V4, Admin, Partner, Supabase or GPS
hardware. Handled login, booking, payment and network failures are **not yet
individually instrumented**; these require separate privacy-safe domain event
work after QA acceptance.

No Sentry project or DSN is created by this GitHub change. The existing
`halo-smart-logistics-web` project belongs to the root web app; do not reuse
its DSN for Customer V4.

## Sentry setup — Sentry account owner

1. Create project `hallo-customer-v4` under organization
   `hallo-smart-logistics` using the **React** platform.
2. Copy the **public project DSN** from Customer V4 project settings. Do not
   confuse a DSN with a Sentry Personal API Token. Never put personal tokens
   in browser builds or GitHub files.
3. Configure only an **approved QA/staging preview build** with:
   - `VITE_CUSTOMER_SENTRY_ENABLED=true`
   - `VITE_CUSTOMER_SENTRY_ENVIRONMENT=qa` (or `staging`)
   - `VITE_CUSTOMER_SENTRY_DSN=<new Customer V4 project public DSN>`
4. Do **not** set these in production deployment settings. In particular,
   production must not set the opt-in trio. Verify environment-scoped variables
   before preview deploy; Vite embeds `VITE_*` values into browser bundles.
5. Preview code paths run only when Vite's `PROD` build flag is true and
   the environment is `qa` or `staging`. Local Vite dev stays disabled.
   This does not mean it is safe to point a QA build at live customer data.

## Privacy design

- Fail-closed event projection: only generic allowlisted exception types,
  numeric stack line/column locations, constant app tags and optional valid
  event IDs survive. Raw exception text and filenames are replaced.
- No Sentry user identity, email, phone, PIN, OTP, auth or refresh tokens,
  OAuth URL hash/query, order/driver IDs, coordinates, payment details,
  raw URLs, headers, request bodies, breadcrumbs, browser metadata or
  application contexts are forwarded by this sanitizer.
- `sendDefaultPii=false`, `defaultIntegrations=false`, no automatic
  HTTP instrumentation, session replay, tracing or auto sessions.
- Do not attach manual Sentry contexts, user identities or custom errors
  without an approved privacy review and corresponding tests.
- PostHog OAuth exposure documented separately in security Draft PR #536;
  do not mistake Sentry filtering for resolving historical PostHog events.

## Acceptance gates (all required before enabling outside a controlled QA build)

- [ ] Customer V4 Sentry project created by organization owner; new DSN verified.
- [ ] Customer V4 typecheck, unit tests and production build PASS in CI.
- [ ] Confirm no Sentry transport in ordinary production build (missing opt-in).
- [ ] QA preview has the exact new Customer V4 project DSN and environment.
- [ ] Anonymous/test-account QA smoke: create a controlled synthetic
      `throw new Error("HALLO_CUSTOMER_V4_QA_SENTINEL")` from a
      `setTimeout` in the **QA preview browser console only**; confirm one
      generic event arrives in the new project with no raw message/PII.
- [ ] QA verify React render boundary fallback and unhandled rejection capture.
- [ ] Inspect the *actual outgoing* QA event payload for OAuth fragments,
      emails, PINs, URLs, order IDs and coordinates (all absent).
- [ ] Inspect Sentry inbound filtering, data retention and project access.
- [ ] Obtain a separate owner approval to merge or deploy. Never deploy
      automatically on the basis of a green unit test alone.

## How to run tests locally

From repository root, install dependencies using the approved project workflow;
then use `npm --prefix apps/customer-mobile-app run test:ci`.

## Rollback / stop

Remove the 3 QA environment variables and redeploy the preview; monitoring
is disabled without the opt-in. If sensitive data is detected, stop the
preview ingestion, rotate any affected credentials, investigate Sentry
event retention, and notify the privacy owner. Never paste affected payloads
or personal API tokens into an issue or chat.
