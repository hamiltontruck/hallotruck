# HALLO Logistics production release hardening

This document is the release-governance evidence for GitHub Issue #250.

## Required `main` protection

Configure a repository ruleset targeting the default branch `main` with all of the following controls:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Require the exact check contexts `test` and `build`.
- Require the branch to be up to date before merging, or use an equivalent merge queue policy.
- Block merging while either required check is pending, failed, or cancelled.
- Do **not** require the PR-only `deploy` job; it is intentionally skipped on pull requests.
- Block force pushes.
- Block branch deletion.
- Apply the rules to repository administrators. Any emergency bypass must use the break-glass process below and be documented.

### Required-check semantics

`test` is the CI job that covers lint, regression tests, TypeScript/production build, and browser smoke tests.

`build` is the deployment-workflow build job that covers lint, business regression tests, web build, browser E2E, mobile tests/build, driver document preview smoke, and combined GitHub Pages artifact validation.

The production migration parity gate runs on pushes to `main`. A behind production marker must block deployment.

## Current production release evidence — 2026-09-02

- Current `main` commit: `a8f9b2ed2ebe78f15530110889c468107801ab56`.
- Production migration marker: `20260902070600`.
- Current successful main Build & Deploy run: `#724`, run ID `33649336256`.
- Migration parity gate on run #724: `success`.
- Web build, browser E2E, mobile test/build, driver document preview smoke, Pages artifact validation, artifact upload, and Pages deploy on run #724: `success`.
- Current Pages artifact ID: `9854324973`.
- Current Pages artifact digest: `sha256:9fde63ca6be676a61f7930faa32b08fc4437b66737fcb88297b024a6cdc1be72`.

### Previous known-good web release

Keep this reference during the next release so the site can be restored without rewriting database history:

- Commit: `ecdd8b4b9138c18bbdc479c5e1379eb314bcf80d`.
- Build & Deploy: `#716`, run ID `33586660507`.
- Pages artifact ID: `9830413065`.
- Pages artifact digest: `sha256:03a7d7d9b1998d720161f64fd2d59d8439c6fcbcd91aa92fe1507cc2ccfcc9f0`.

## Web rollback procedure

A web rollback is a source/deployment operation only. It must not rewrite production database or financial history.

1. Identify the last known-good deployed commit and its successful Pages run/artifact above.
2. Create a focused rollback or forward-fix branch from the current `main`; do not force-push `main`.
3. Revert only the faulty web commit(s), or apply a forward fix when safer.
4. Open a pull request and require `test` and `build` to pass.
5. Merge through the protected branch process.
6. Require the production migration parity gate to pass on the resulting `main` push.
7. Verify the new Pages artifact digest and deployment run before declaring recovery complete.

Do not bypass required checks merely to restore an older frontend artifact if its code expects an older database schema.

## Database rollback / forward-fix policy

Production migrations are append-only release history. Do not delete applied migration records, edit already-applied migration files to disguise history, or mutate immutable financial/audit rows to make data match an expected result.

For a database regression:

1. Stop the affected release path if data integrity could worsen.
2. Record the current applied migration version and affected objects.
3. Prefer a new forward-fix migration that safely restores constraints, policies, functions, or behavior.
4. If compensating data is required, use the domain-approved append-only correction workflow with actor, reason, request key, and audit trail.
5. Never rewrite original payment, commission, settlement, or audit rows to force reconciliation.
6. Apply production DDL only through the approved migration process and then advance `supabase/production-migration-version.txt` in a separate marker PR.
7. Re-run RLS/grant/function/trigger verification and Supabase advisors after DDL changes.
8. Require the next `main` deployment parity gate to pass.

## Break-glass procedure

An administrator bypass is exceptional and must not be routine release practice.

Before bypassing a repository rule, record:

- incident/reason;
- actor;
- exact commit SHA;
- failed or unavailable required check;
- production migration version;
- rollback/forward-fix plan.

After the emergency action, immediately run the full required checks and production smoke matrix. Any bypass that changes production data must still preserve immutable financial and audit history.

## Final authenticated production smoke matrix

Complete this matrix after a production deployment and before closing Issue #250:

- [ ] Root web app loads from the production URL with no asset/chunk failures.
- [ ] Customer login succeeds and routes only to Customer surfaces.
- [ ] Driver login succeeds and routes only to Driver surfaces.
- [ ] Admin login succeeds and routes only to Admin surfaces.
- [ ] CEO login succeeds and routes only to leadership surfaces.
- [ ] Partner login succeeds only with active organization membership.
- [ ] Logout clears the active session and protected routes fail closed.
- [ ] Refresh preserves the correct authenticated role/session.
- [ ] Browser back/forward preserves correct role/session behavior.
- [ ] Direct protected URLs preserve authorization boundaries.
- [ ] Cross-role attempts are denied.
- [ ] Suspended/demoted leadership is denied with an existing token.
- [ ] Missing-profile authorization fails closed.
- [ ] No blocking console errors.
- [ ] No failed application/API network requests in the smoke flow.
- [ ] Main Build & Deploy migration parity gate is green.
- [ ] Current Pages deployment run and artifact digest are recorded.
- [ ] Previous known-good Pages commit/artifact remain recorded for rollback.

## Branch-protection verification test

After the ruleset is enabled:

1. Open a temporary PR whose `test` or `build` check deliberately fails without weakening application/security behavior.
2. Verify GitHub reports the PR as blocked from merge while the required check is failed.
3. Verify a pending required check also blocks merge.
4. Close the temporary PR without merging it.
5. Verify direct push, force push, and branch deletion protections according to the configured policy.

Issue #250 is complete only after the repository ruleset is active and the final authenticated production smoke matrix is recorded.