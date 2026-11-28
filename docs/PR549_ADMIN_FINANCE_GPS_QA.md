# PR #549: Separate Finance from Live trips

Payment collection belongs in Finance. Live trips starts with the fleet map and
opens operations without querying the payment ledger. Finance payment details do
not depend on delivery proofs or trip geometry. The default combined operations
view remains available to existing callers.

A successful asynchronous payment retains the form element before awaiting
its RPC, resets the form and reloads the ledger. Previously React cleared
`event.currentTarget`, causing a saved payment to show an error and stale totals.

## Verification

- `npm run lint`
- `npm run test:regression`
- `npm run build`
- `npm run test:admin-finance-separation`
- `node scripts/verify-production-migration-parity.mjs`

The focused browser test runs real React components with synthetic external I/O
and blocks external requests. It checks operations independence from payments,
Finance independence from delivery proofs, and successful payment reset/refresh.
It is also included in the browser CI suite.

Admin Operations, Finance V3 and Fleet Enterprise smoke assertions previously
passed using a temporary Playwright Chromium adapter in the managed sandbox.
The Finance fixture explicitly supplies an empty public MapTiler setting for its
new imported map module.

## Release scope

This release changes only the Finance/Live trips frontend and its tests. GPS IMEI
linking UI, RPC, migration, audit and related QA tests are preserved separately
on `qa/admin-fleet-gps-linking` for isolated backend QA. No database migration or
production migration marker change is required for this release.
