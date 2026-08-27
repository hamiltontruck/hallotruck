# Fleet Management Enterprise

## Production scope

Fleet Management Enterprise extends the existing `trucks`, `truck_maintenance_records`,
`partner_fleet_vehicles`, `orders`, and `tracking_pings` foundations. It does not replace
financial history, Partner Wallet records, dispatch history, or the Android GPS pipeline.

The feature provides:

- normalized, globally unique fleet plate numbers;
- company and Partner fleet branches;
- ownership, fuel, capacity, odometer, compliance expiry, and service profiles;
- Available, Assigned, On Trip, Maintenance, Suspended, and Inactive states;
- assigned-driver and active-trip safeguards;
- maintenance schedules and immutable fleet audit events;
- Admin/CEO and Partner organization summaries;
- a read-only latest-location interface backed by the existing tracking pings;
- mobile-safe Admin and Partner vehicle cards.

Live GPS dispatch is deliberately out of scope. `gps_provider`, `gps_external_id`, and
`last_location_at` are the stable adapter boundary for a future provider integration.

## Authorization matrix

| Workflow | CEO | Admin | Partner Owner/Admin | Partner Editor/Viewer | Assigned Driver | Other Driver | Anonymous |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Global fleet summary | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| Organization fleet summary | Allow | Allow | Own organization | Deny | Deny | Deny | Deny |
| Create/update company fleet | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| Create/update Partner fleet | Allow | Allow | Own organization | Deny | Deny | Deny | Deny |
| Assign a Driver or change operational status | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| Create/update maintenance workflow | Allow | Allow | Own organization | Deny | Deny | Deny | Deny |
| Read operational truck row | Allow | Allow | Own organization | Own organization | Assigned vehicle | Deny | Deny |
| Read fleet audit | Allow | Allow | Own organization | Own organization | Own subject events | Deny | Deny |

Leadership authorization is resolved from `public.profiles.role` through
`private.is_admin_or_ceo()`. User-editable metadata and stale JWT role claims are not used.

## Database design

Migration: `supabase/migrations/20260827175200_fleet_management_enterprise.sql`

New tables:

- `fleet_branches`: company or Partner organization branches.
- `fleet_audit_events`: immutable status, assignment, profile, branch, and maintenance events.

Extended tables:

- `trucks`: canonical operational fleet record.
- `partner_fleet_vehicles`: organization-facing record linked to a canonical truck.
- `truck_maintenance_records`: existing service ledger with audited status transitions.

All new public tables have RLS enabled. Anonymous privileges are revoked. Authenticated
clients receive read-only table grants; mutations use audited `SECURITY DEFINER` RPCs that
validate `auth.uid()` and the database role or Partner membership before bypassing RLS.

Cross-table plate uniqueness uses a normalized generated key and a transaction advisory
lock. Existing invalid or duplicate plates stop the migration instead of silently changing
production data.

## Operational state rules

- `On Trip` is derived whenever an accepted or in-transit order exists.
- A vehicle with an active trip cannot leave `On Trip` or change assigned Driver.
- A vehicle cannot be manually placed `On Trip` without an active trip.
- Maintenance, Suspended, and Inactive vehicles are not dispatch-ready.
- A critical expiry or overdue/in-progress maintenance state blocks dispatch readiness.
- Odometer readings cannot move backwards.
- Every profile, status, assignment, and maintenance status change requires a reason.
- Historical maintenance and audit rows are never deleted to correct the current state.

## Deployment order

The migration revokes direct fleet writes, so deploy the application and migration as one
release window.

1. Confirm the latest production backup and record its restore point.
2. Confirm PR CI has passed `npm ci`, lint, regression, build, and browser smoke tests.
3. Merge the approved PR. Do not apply the migration to the old application bundle.
4. Apply `20260827175200_fleet_management_enterprise.sql` through the normal Supabase
   migration workflow.
5. Wait for the GitHub Pages deployment containing the RPC-based fleet clients.
6. Confirm PostgREST schema reload completed.
7. Run the role and workflow smoke checklist below.
8. Run Supabase security and performance advisors and compare new findings with the
   pre-release baseline.

## Production smoke checklist

### CEO and Admin

- Open `/#/admin/fleet-maintenance` and refresh the page.
- Confirm total, dispatch-ready, on-trip, maintenance, and expiry KPIs load.
- Create a branch and a unique test vehicle only when authorized operational test data is
  available; do not alter real vehicle history for testing.
- Update compliance dates with a reason and confirm one immutable audit event.
- Assign an approved Driver and confirm the vehicle becomes Assigned.
- Confirm an active-trip vehicle cannot be suspended, made available, or reassigned.
- Add scheduled maintenance, start it, then complete or cancel it with reasons.

The production project currently has a CEO account and no separate Admin profile. The Admin
path is covered by the shared database predicate, regression suite, and browser fixture; a
live Admin-account smoke requires an authorized Admin account to be provisioned by HALLO.

### Partner Owner/Admin

- Open the Partner portal and select Fleet.
- Confirm only the current organization vehicles, branches, maintenance, and audit load.
- Confirm Owner/Admin can register a unique vehicle, edit compliance, and add maintenance.
- Confirm Editor/Viewer cannot see the Fleet control tab or call fleet write RPCs.
- Confirm another organization ID is rejected by the fleet read and write RPCs.

### Driver

- Confirm the assigned Driver can read the assigned vehicle used by an active order.
- Confirm another Driver cannot read that vehicle or its organization fleet summary.
- Confirm Drivers cannot create branches, vehicles, maintenance records, assignments, or
  status changes.
- Confirm existing Jobs, Active Trip, GPS tracking, Earnings, and Commission flows remain
  unchanged.

### Mobile and browser

- Test Admin and Partner fleet cards at 320px, 360px, 390px, and 412px.
- Confirm no horizontal page overflow, clipped currency/plate values, hidden actions, or
  touch targets below 44px.
- Confirm page refresh preserves role access and no permission errors appear in the console.

## Validation commands

```bash
npm ci
npm run lint
npm run test:regression
npm run build
npm run test:e2e-smoke
```

Migration validation must run inside `BEGIN ... ROLLBACK` against the current production
schema before deployment. It must cover CEO authorization, Partner tenant access, assigned
and other Driver isolation, anonymous privilege denial, normalized duplicate plates, audit
creation, active-trip guards, summary reconciliation, and absence of persistent QA rows.

## Rollback plan

Before migration application, rollback is simply closing the PR or reverting the application
branch. After production migration application:

1. Stop fleet write actions during rollback.
2. Redeploy the last known-good application bundle only together with a reviewed
   compatibility migration that restores the previous write contract.
3. Do not delete `fleet_audit_events`, maintenance rows, branches, or vehicle profile data.
4. Preserve plate normalization and audit history while restoring compatibility.
5. If schema recovery is unsafe, restore the verified pre-release database backup and
   reconcile any legitimate fleet events created after the restore point.

Never use production fleet or financial history as disposable smoke-test data.
