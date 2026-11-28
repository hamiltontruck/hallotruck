# PR #549: Admin Finance, Live trips and GPS linking

Payment collection belongs in Finance. Live trips starts with the fleet map and
opens operations without querying the payment ledger. Finance payment details do
not depend on delivery proofs or trip geometry. The default combined operations
view remains available to existing callers.

A successful asynchronous payment now retains the form element before awaiting
its RPC, resets the form and reloads the ledger. Previously React cleared
`event.currentTarget`, so a successful payment could display an error and leave
stale totals, encouraging a duplicate submission.

Admin/CEO GPS linking normalizes the registered plate, validates a 15-digit IMEI,
locks the truck, rejects replacement of existing links and uses a unique index to
prevent reuse of a device. An identical retry succeeds without another write.
Each new link also writes a `profile_updated` fleet audit event, including actor,
truck and old/new GPS metadata, in the same transaction. Existing immutable audit
history and its access policies remain in effect.

## Repeatable verification

- `npm run lint`
- `npm run build`
- `npm run test:regression` (includes the new disposable GPS database test)
- `npm run test:admin-finance-gps` (21 database assertions and four browser scenarios)

The database test uses PGlite with synthetic principals/tables and executes the
actual GPS migration. It verifies anonymous/customer/driver/partner denials,
Admin/CEO linking, lack of direct authenticated table-write permission, IMEI and
plate validation, duplicate prevention, idempotent retry and audit attribution.
It is a focused PostgreSQL-compatible test, not a full hosted Supabase migration
or Traccar integration test.

The browser test runs real React components and the actual fleet service with
fixture I/O. It checks independent Finance/operations queries, successful payment
reset/refresh and mobile GPS form validation, server-error preservation and retry.
It blocks all external requests and uses no real users or production credentials.
It is included in `test:e2e-smoke` for CI.

Additional Admin Operations, Finance V3 and Fleet Enterprise smoke assertions
passed at their mobile/tablet widths. In this managed sandbox Chromium's direct
`--dump-dom` launcher timed out; these three scripts were run with a temporary
Playwright Chromium CLI adapter that waited for each fixture's `data-ready`
marker and returned its real DOM. No smoke assertions were skipped. The Finance
fixture also needed an explicit empty public MapTiler setting after its new
payment collection import introduced the live-trip map module.

## Deployment boundary

Apply `20261127233000_admin_link_fleet_gps.sql` to an isolated QA backend before
exercising GPS linking on a hosted preview. The migration intentionally refuses
pre-existing duplicate trimmed Traccar identifiers; inspect and resolve those
records with the device owner before deployment rather than silently relinking.
A frontend preview alone does not install the RPC or uniqueness index.

A saved IMEI is device mapping, not evidence of live GPS connectivity. Traccar
provisioning, authenticated telemetry ingestion, real device/vehicle testing and
hosted authenticated QA remain separate acceptance gates. This PR does not
implement or claim those integrations, and no production or GPS QA backend was
changed during this review.
