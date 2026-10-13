# Partner Driver Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Partner driver ownership, workspaces and administrative rosters without changing existing HALLO driver behavior.

**Architecture:** Introduce server-managed ownership derived exclusively from claimed Partner registrations. Routes use a server self-context to select the proper workspace; SQL separately enforces roster, vehicle, document and trip access. Reuse document/trip components with a workspace context instead of duplicating their business rules.

**Tech Stack:** PostgreSQL/Supabase Auth, SQL migrations, React/TypeScript, HashRouter, PGlite and Playwright.

**Spec:** `docs/partner-driver-workspace-separation.md` (user approved).

## Global Constraints

- No existing driver ownership transfers, preview-account imports, fee changes, unrelated Customer/chat migrations or shared deployment-protection changes.
- Ownership lookup errors deny access; they never default to HALLO classification.
- Invited registrations without a driver create no ownership row. Claimed rejected registrations retain ownership.
- Pending Partner drivers can complete own documents but cannot work. Inactive organizations disable operational access.
- Preserve existing role=driver, identity/document IDs, required document checks, audit and history.
- Public deployment requires hosting permission; fixture tests do not establish device success.

## Review Focus

- A claimed but rejected registration must not become a HALLO driver through fallback; Task 1 tests it.
- Concurrent invite claims must not overwrite ownership or create two organizations; Task 1 tests unique ownership and transaction rollback.
- Stale vehicle links and recently changed organization status must not authorize a trip/document mutation; Task 2 tests server checks.
- Refresh/login on a wrong portal must route safely without a flash of the general job board; Task 3 tests it.
- Trip completion/cancellation and account switching must retain correct navigation and erase stale workspace context; Task 4 tests it.

## Task 1: Ownership and server rosters

**Files:** Create CLI-generated `supabase/migrations/<timestamp>_partner_driver_workspace_ownership.sql`; create `scripts/partner-driver-ownership-db-test.mjs`; modify `src/services/partner-driver.service.ts`.

**Interfaces:** `get_my_driver_workspace()` returns `{kind:'hallo'|'partner',driver_id,partner_id,partner_name,organization_active,driver_status}` for the authenticated driver only. `list_admin_driver_roster(p_scope text)` returns existing compliance profile fields plus Partner display/vehicle information and accepts only `hallo` or `partner`; requires active leadership. `list_partner_driver_roster(p_partner_id uuid)` uses existing manager authorization and returns only that organization. TypeScript exposes `getMyDriverWorkspace(): Promise<DriverWorkspace>` and `getAdminDriverRoster(scope): Promise<DriverRosterRow[]>`.

- [ ] Write fixture tests: HALLO driver with an old fleet association stays HALLO; claimed pending/approved/rejected registration stays Partner; invited row creates no ownership; foreign Partner/anon/driver cannot read manager roster; direct ownership write denied; HALLO and Partner rosters disjoint; malformed or conflicting backfill fails atomically.
- [ ] Run `node scripts/partner-driver-ownership-db-test.mjs`; confirm failure before migration.
- [ ] Generate the migration using the available Supabase CLI. Create `partner_driver_ownership` with unique driver FK and organization FK, denied direct writes, checked self/manager/leadership RPCs and immutable ownership authority. Validate then backfill only matching claimed registrations. Extend claim atomically, keeping existing registration validation and idempotent retries. Use fixed search paths and revoke PUBLIC/anon mutation execution.
- [ ] Add service types and wrappers with propagated errors; test ownership lookup failures and concurrent claims without defaulting to HALLO.
- [ ] Run the new SQL test and `node scripts/partner-driver-registration-db-test.mjs`; require both pass. Commit only Task 1 files.

## Task 2: Operational and document backend enforcement

**Files:** Extend Task 1 migration; extend `scripts/partner-driver-ownership-db-test.mjs`; inspect relevant latest SQL definitions in `supabase/migrations`, `supabase/functions/tracking/index.ts` and trip lifecycle handlers before changing them.

**Interfaces:** `private.require_driver_workspace_access(p_order_id uuid default null,p_truck_id uuid default null)` checks active authenticated driver, organization and own-Partner assignment when ownership exists. Generic HALLO claim paths reject Partner ownership. `get_partner_driver_active_trip()` returns only the caller's own authorized active trip, matching the existing trip service shape.

- [ ] Inventory actual deployed/latest definitions for `claim_order`, `claim_order_with_truck`, their v2 variants, `driver_available_trucks_for_order`, `driver_save_vehicle_profile`, Admin linking/approval, order SELECT/UPDATE policies, verification/storage policies, tracking, delivery and GPS functions. Save non-secret function/ACL preflight for rollback; do not assume the oldest source definition is active.
- [ ] Add failing SQL/API tests for HALLO job claim by Partner driver, foreign Partner order/vehicle, inactive organization, pending/suspended operational mutation, canonical linked own vehicle uploads, direct table/policy paths, and unchanged HALLO claim/documents behavior.
- [ ] Implement workspace guards at each actual mutation boundary and restrict public-job visibility without changing customer/leadership/Partner-manager access. Do not rely on UI or service prechecks. Keep generic HALLO vehicle linking/approval unavailable to Partner-owned drivers, with the dedicated atomic approval path retained. Restrict Partner vehicle profile updates to their Admin-linked canonical truck rather than creating another truck.
- [ ] Run new authorization tests and existing registration/commission regression tests. Require rejected/inactive and stale-link cases to fail closed. Commit Task 2.

## Task 3: Login, gate, home and Partner roster

**Files:** Create `src/components/auth/PartnerDriverGate.tsx`, `src/components/driver/DriverWorkspaceContext.tsx`, `src/pages/PartnerDriverLogin.tsx`, `src/pages/PartnerDriverHome.tsx`, `src/pages/PartnerDrivers.tsx`; modify `src/components/auth/DriverGate.tsx`, `src/pages/Login.tsx`, `src/pages/PartnerDriverJoin.tsx`, `src/pages/PartnerOperationsHub.tsx`, `src/App.tsx`, `src/partner-platform-main.tsx`.

**Interfaces:** Workspace context supplies `{kind,basePath,partnerName}`; default HALLO path is `/driver`, Partner path `/partner/driver`. Login calls `getMyDriverWorkspace()` after Auth success. Gate resolves signed-in server context and status before mounting children. Partner roster obtains organization through existing authorized Partner context, not an unchecked URL alone.

- [ ] Create `scripts/partner-driver-workspace-browser-test.mjs` using the existing local HTTP/actual React/actual SDK test pattern. Pin pending Partner→documents, approved Partner→home, HALLO→HALLO, wrong portal redirects, non-driver denial, failed context retry, session switching and no public-job flash.
- [ ] Run the test to confirm routes/gates are missing.
- [ ] Add `/partner/driver/login`, `/partner/driver`, `/partner/driver/documents`, `/partner/driver/trip` and `/partner/drivers` in both entries. Registration completion uses a local Router link to Partner Driver login. Partner home shows organization, approval and own canonical vehicle, without HALLO jobs/wallet/commission links. Pending access exposes documents only. Suspended/inactive access shows explicit blocked state.
- [ ] Add Partner Drivers navigation and own organization roster, preserving existing Fleet registration entry. Explicit account switch signs out and clears derived context. No automatic sign-out of a different Partner manager account simply from visiting a link.
- [ ] Run workspace browser tests and scoped/full builds. Commit Task 3.

## Task 4: Documents and assigned trip navigation

**Files:** Modify `src/pages/Documents.tsx`, `src/pages/ActiveTrip.tsx`, `src/components/driver/DriverBottomNav.tsx`, `src/services/driver.service.ts` and reused trip components with hardcoded driver links; extend workspace browser tests.

**Interfaces:** Shared pages consume workspace context. Partner active-trip loader calls `get_partner_driver_active_trip()`; all Partner mutations retain Task 2 server authority. Existing HALLO interfaces keep their current defaults.

- [ ] Add failing tests for Partner documents requiring Admin-linked own vehicle, no HALLO self-create vehicle affordance, assigned-trip-only view, empty trip, completion/cancellation paths, real GPS control mounting and no HALLO job fallback. Pin all Partner navigation destinations to `/partner/driver`.
- [ ] Reuse upload/review and route/GPS/proof components with explicit context. Provide Partner Home/Documents/Trip nav and header. Hide HALLO wallet and commission actions in Partner context; do not add new payment behavior. Remove hardcoded redirects only where shared paths require workspace destinations.
- [ ] Run workspace and existing document/trip browser tests, new SQL tests and full regression suite. Verify HALLO renders unchanged with no context override. Commit Task 4.

## Task 5: Admin roster separation and release

**Files:** Modify `src/pages/AdminDriverCompliance.tsx`, `src/pages/AdminPartnerDrivers.tsx`, Admin manual/dispatch operational roster consumers discovered in Task 2, `src/App.tsx`, `src/partner-platform-main.tsx`, `package.json`, `.github/workflows/ci.yml`; update `docs/partner-driver-onboarding.md`.

**Interfaces:** Shared document review accepts `scope:'hallo'|'partner'` and uses server-scoped roster/document data. `/admin/driver-compliance` is HALLO; `/admin/partner-driver-compliance` is Partner. Partner review displays organization, canonical vehicle and approval status and links to the Partner review route.

- [ ] Add browser/API tests proving both Admin populations are disjoint and a changed URL cannot grant another role access. Test generic HALLO linking/approval denies Partner-owned drivers while dedicated Partner approval remains atomic. Include legacy HALLO driver with historical fleet linkage.
- [ ] Implement server-scoped Admin fetching and separate route labels; use shared document rendering. Keep historical financial/audit data intact. Update operational roster consumers; do not hide legitimate history to enforce a current roster.
- [ ] Add new SQL/browser commands to CI. Run `npm run test:regression`, the workspace browser test, registration browser test, appropriate full browser checks, full build and production-config scoped build. Record any environment-specific failures accurately.
- [ ] Prepare focused PR against merged main, with exact source revision and verification. Review SQL/ACL rollback and migration effects before applying the authorized migration. Run rollback-only production checks; no Auth account or payment fixtures.
- [ ] Deploy protected review UI and inspect served HTML/assets. Attempt public release only when required project capability exists, preserving the shared protection. Provide device test for Partner invitation/login/documents/Admin approval/own assigned TEST trip and real GPS. Do not claim physical-device validation without evidence.
- [ ] Commit final documentation and report implementation, checks, deployment state and remaining device/hosting limitations separately.

## Execution handoff

Recommended method: native implementation in this session, because the SQL guards and shared route context have sequential dependencies and share the existing worktree. No agents are spawned without explicit authorization. Plan review is the next checkpoint required by the writing-plans skill; no product code has been changed for this separation yet.
