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

## Session replay

Session replay remains disabled. It must not be enabled until masking, sensitive-route exclusions, data retention and a separate privacy review are completed.

## Production verification

After deployment:

1. Confirm `$pageview` events arrive with normalized `route`, `environment`, `release` and `device_class`.
2. Confirm no query strings or dynamic order identifiers appear.
3. Sign in with a test account and verify only opaque distinct ID and controlled role are present.
4. Search recent events for email, phone, receipt, document, token and transaction-reference patterns; the result must be empty.
5. Keep session replay disabled.
