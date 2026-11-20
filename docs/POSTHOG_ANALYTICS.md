# HALLO PostHog analytics contract

## Purpose

PostHog is used for privacy-safe operational product analytics: route usage, workflow completion, role segmentation, release health and mobile breakdowns. It is not a financial ledger, audit store or source of truth for orders, payments, commissions, settlements, identity or compliance.

## Build configuration

The GitHub Pages build accepts:

- `VITE_POSTHOG_PROJECT_TOKEN` — public PostHog project token, configured as a GitHub Actions repository variable.
- `VITE_POSTHOG_HOST` — ingestion host, normally `https://us.i.posthog.com`.
- `VITE_RELEASE_SHA` — injected automatically from the GitHub commit SHA.

When the project token is absent, analytics is a safe no-op and local development remains usable.

## Privacy boundary

The browser integration deliberately disables:

- automatic click and form autocapture;
- automatic pageview and pageleave capture;
- session recording;
- PostHog exception capture;
- feature-flag network requests.

HashRouter pageviews are captured manually with normalized routes. Query strings, hashes containing user input and dynamic order identifiers are removed before transmission.

Authenticated users are identified only by the internal opaque database UUID. The only person property currently sent is the controlled database role plus environment and release metadata.

Never capture:

- names, phone numbers, emails or addresses;
- passwords, auth tokens, cookies or authorization headers;
- receipt paths or receipt contents;
- document paths or document contents;
- photos, signatures or delivery notes;
- payment provider references, transaction IDs or full financial references;
- free-text form contents, cargo notes, rejection reasons or audit notes;
- raw URLs containing query strings;
- raw errors, stack traces or database messages.

## Common properties

Every custom event may contain only controlled properties from this list:

- `environment`
- `release`
- `route`
- `role`
- `outcome`
- `workflow`
- `source`
- `device_class`
- `payment_method`
- `order_state`
- `reason_code`
- `error_code`
- `organization_type`

No order ID, tracking ID, customer ID, driver ID, organization ID or payment ID is currently sent.

## Event taxonomy

The approved event names are:

- `login_succeeded`
- `login_failed`
- `quote_created`
- `order_placed`
- `order_cancelled`
- `driver_assigned`
- `job_accepted`
- `trip_started`
- `trip_completed`
- `payment_confirmed`
- `payment_not_received`
- `settlement_requested`
- `settlement_approved`
- `settlement_payment_recorded`
- `permission_denied`
- `route_not_found`

Workflow code must call `captureAnalyticsEvent` rather than the PostHog global directly. New events or properties require an update to this contract and focused privacy regression coverage.

## Customer Mobile V4 workflow instrumentation

The active React Customer Mobile V4 journey emits these event names only through the
allowlisted `captureAnalyticsEvent` API (separate staged change after the OAuth privacy fix):

- `login_succeeded`: Supabase password sign-in succeeded. This does not establish
  the Customer role gate or completion of profile setup.
- `login_failed`: a password sign-in attempt was rejected/unavailable, with
  controlled `reason_code=login_unavailable`, never the email/password or error text.
- `quote_created`: a server quote preview returned successfully, not a completed order.
- `order_placed`: the create-order service returned a confirmed persisted order;
  no order ID, tracking ID, price, location or customer details are sent.
- `order_cancelled`: server-confirmed cancellation; the free-text reason and order ID
  are not included in analytics.
- `route_not_found`: route-preview fetch failed; `reason_code=route_preview_unavailable`
  means this also covers network/service failures, not necessarily no geographic route.
- Manual `$pageview`: React state navigation emits fixed routes including Home, Book,
  Orders, Track, Payments, Profile, Help and Settings. No dynamic order identifiers,
  OAuth hash, raw query or URLs may be transmitted.

A successful local/CI test is **not** proof that a production event has been received.
Verify new event ingestion in PostHog after a separately approved deployment, and do
not calculate a funnel until events, denominators and release cohorts are validated.
Do not enable session replay, click/field autocapture or raw exception capture.

## Session replay

Session replay remains disabled. It must not be enabled until masking, sensitive-route exclusions, data retention and a separate privacy review are completed.

## Production verification

After deployment:

1. Confirm `$pageview` events arrive with normalized `route`, `environment`, `release` and `device_class`.
2. Confirm no query strings or dynamic order identifiers appear.
3. Sign in with a test account and verify only opaque distinct ID and controlled role are present.
4. Search recent events for email, phone, receipt, document, token and transaction-reference patterns; the result must be empty.
5. Keep session replay disabled.
