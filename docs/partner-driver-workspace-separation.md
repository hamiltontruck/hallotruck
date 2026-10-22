# Partner and HALLO driver workspace separation

Status: proposed for user review, 2026-10-12. Extends the existing driver registration, verification and trip flows. This document is not an implementation or deployment claim.

## Required outcome

Partner owners see only their own drivers under Partner → Drivers. HALLO leadership sees Partner drivers, with organization, vehicle and approval status, separately from HALLO drivers. Partner drivers use a dedicated Partner Driver login, documents and assigned-trip workspace. HALLO drivers retain their existing workspace. Partner accounts and driver credentials remain distinct. Existing fee and payment approval rules remain unchanged.

## Ownership authority

Add an explicit server-managed driver ownership relation with a unique driver ID and Partner organization ID, sourced from successfully claimed Partner registration. Claim and ownership creation must be atomic. Backfill only claimed registrations whose driver/profile identity and organization match; conflicting rows stop migration rather than guessing. Invited registrations without a driver create no ownership row. Registered, approved and rejected claimed registrations retain ownership for history; rejection must not turn a Partner driver into a HALLO driver. An inactive organization disables Partner operational access without deleting ownership.

Existing fleet associations are vehicle assignments, not sufficient driver ownership evidence. Do not reclassify HALLO drivers such as Adil Abdu from historical fleet records. Do not copy preview users or automatically transfer existing HALLO accounts. Reclassification is outside this change and requires an explicit reviewed workflow.

Ownership writes are available only through guarded registration/leadership functions. Drivers cannot select another organization through metadata, a URL, a request body or a direct table write. Preserve role=driver and existing profile/document IDs. Add authenticated self-context RPC returning only the caller's driver ownership, organization display name, active state and approval status. Partner roster and Admin HALLO/Partner roster RPCs enforce organization/leadership authorization in SQL; each list must have a disjoint driver population. Do not use client-side filtering as the security boundary.

## Routes and access

Add /partner/driver/login, /partner/driver, /partner/driver/documents and /partner/driver/trip to both full and scoped apps. Add Partner → Drivers navigation as a dedicated organization-gated page; retain existing Fleet invitation entry for compatibility. Registration completion points to the local Partner Driver login instead of the external HALLO Driver login.

After authentication the server self-context selects the authorized workspace. A Partner driver opening /driver routes is sent to their Partner workspace; a HALLO driver opening Partner Driver routes is sent to their HALLO workspace. This routing is convenience only: backend operations independently check ownership. Pending Partner drivers can access documents and onboarding status, but cannot start work. Suspended drivers or inactive organizations cannot perform operational mutations. Ownership lookup errors deny access and show a retry state; they never default to HALLO classification.

Partner Driver navigation contains Home, Documents and Trip. Home shows organization, approval and assigned vehicle; it does not expose the public HALLO job board, HALLO wallet or HALLO commission actions. Trip shows only an order assigned to this authenticated driver through an authorized own-Partner dispatch. No active trip produces an empty state, not a public jobs fallback. Every link after cancellation, completion and empty states stays inside Partner Driver routes.

## Shared document and trip components

Reuse existing verification upload, document review, route, GPS and delivery-proof components through an explicit workspace context. Avoid duplicating document business rules. Remove hardcoded /driver redirects from components used by Partner Driver routes and render the correct navigation/header. Partner drivers may upload documents only for themselves and the canonical own-Partner vehicle linked by Admin; they may not use the generic vehicle-profile flow to create or claim a different HALLO truck. Keep pending vehicles inactive.

Reuse existing trip lifecycle and real GPS handling while adding server checks for own-Partner assigned order/truck. Partner drivers cannot browse or accept general HALLO jobs or substitute another Partner vehicle. Preserve HALLO driver behavior when no Partner ownership exists. Existing payment and commission boundaries remain authoritative; this change introduces no new payment collection, commission or settlement path.

## Admin controls

Admin → Partner drivers lists organization, driver, assigned vehicle and approval status. Partner document review is an explicit separate route backed by the Partner roster. Admin → HALLO drivers/document review uses the HALLO roster. Both routes can share document rendering, but fetch only their authorized population. Generic HALLO onboarding approval/linking must reject Partner-owned drivers; Partner approval retains the existing atomic document checks and ownership/vehicle checks. All mutations keep the existing leadership authentication and audit requirements.

Inventory all generic operational driver lists used for dispatch, document review and manual vehicle onboarding. Filter them through server ownership scope, while preserving historical order/payment records; do not delete history or incorrectly hide audit records. Other financial changes and redesigns are outside scope.

## Verification

SQL tests must prove disjoint own-Partner/other-Partner/HALLO lists, ownership creation and backfill correctness, role and direct-write denial, inactive/rejected/suspended handling, HALLO job acceptance denial for Partner drivers, own-Partner assigned-trip access, foreign-trip/vehicle denial and unchanged HALLO behavior. Test latest required documents and atomic approval rollback.

Browser tests exercise actual routes with mocked external Auth/RPC boundaries: registration completion goes to Partner login; pending driver reaches only own documents; approved driver sees own assigned trip and Partner navigation; wrong portal redirects correctly; ownership failures do not grant access; Admin lists and Partner rosters remain separate. Run existing regression suite, full/scoped builds and relevant driver document/trip browser checks.

After checks pass, prepare a focused PR against merged main, apply only the reviewed additive migration, and deploy a protected review build. Public deployment still requires the previously missing hosting permission. Physical-device verification must use an owner-controlled TEST trip and actual driver GPS; no simulated production position or real payment is created for testing.

## Delivery boundaries

No existing driver ownership transfers, preview-account imports, fee changes, unrelated Customer/chat migrations or shared deployment-protection changes. UI access and device testing are reported separately from fixture coverage. Implementation starts after this written spec is reviewed, followed by a concrete implementation plan.
