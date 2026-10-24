# Partner Operations Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give Partner fleet owners a unified operational dashboard, live map and driver management supporting the existing HALLO job lifecycle.

**Architecture:** Reuse existing scoped RPCs and canonical orders. Separate pure lifecycle/driver filtering from read services and page rendering. Keep legacy workspace reachable and preserve server-side authority.

**Tech Stack:** React, TypeScript, HashRouter, existing Supabase SDK, MapLibre, Node tests and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-partner-operations-dashboard-design.md`

## Global Constraints
- No payment/commission/dispatch authority changes or production fixtures.
- Approved own drivers only; retain HALLO driver separation and server authorization.
- No simulated GPS; reuse freshness classifier and verified live-trip RPC.
- Legacy projects/documents/finance remain reachable; keep organization in navigation.
- Mobile layouts at 320–768px, recoverable errors, no error-as-zero metrics.

## Review Focus
- Conflicting canonical order/request states must not become fake active/delivered work (Task 1).
- Switching organization must ignore old requests and immediately conceal old data (Tasks 2/3).
- Viewer/editor roles must not invoke owner/admin driver RPCs (Task 2).
- Invalid GPS coordinates, unavailable tiles/key and lost selection must not break refresh (Task 3).
- Unclaimed invitations and repeated registration rows must not inflate approved-driver counts (Tasks 1/2).

### Task 1: Operational read model
**Files:** create `src/domain/partner-operations.ts`, `src/services/partner-operations.service.ts`, `scripts/partner-operations-test.mjs`; modify live and dispatch read services.
**Interfaces:** `partnerJobStage(request)` returns offered/awaiting_confirmation/ready/in_transit/delivered/closed/unknown from request plus canonical order. `loadPartnerOperations(partnerId,canManageDrivers)` returns independent fleet/jobs/live/drivers sections with error states. Driver rows join registrations via driver_id; filter functions remain pure.
- [x] Add and run failing lifecycle, conflicting assignment, missing order, failed source, role and registration identity tests.
- [x] Implement scoped lightweight fleet reads, job hydration using existing contracts, independent sources and truthful stage mapping. Preserve existing live tests and confirmed-trip RPC checks.
- [x] Run new model/service tests and existing regression suite; commit.

### Task 2: Dashboard, navigation and Drivers
**Files:** create `src/pages/PartnerOperationsDashboard.tsx`, reusable Partner navigation and organization-scope hook; modify `PartnerOperationsHub.tsx`, `PartnerDrivers.tsx`, `PartnerPortal.tsx`, `PartnerDriversPanel.tsx` as needed, `App.tsx` and `partner-platform-main.tsx`.
**Interfaces:** Shared scope exposes resolved membership, selected organization and switch callback; resets scoped data before switching. Dashboard links to existing jobs/fleet/live/driver functions; legacy portal moves to `/partner/workspace` with validated permission-aware tab query.
- [x] Add failing browser coverage for lifecycle cards/navigation, role denial, stale organization responses and driver search/status filters.
- [x] Implement operational cards and job-stage list, independent section errors, empty/loading states and last refresh. Keep current role and invitation authority; expose manual private-link sharing only.
- [x] Implement searchable/filterable driver roster and invitation counts, explicit restricted state, organization switching, and existing onboarding flow without session replacement.
- [x] Run browser tests at 320/390/768px, existing Partner driver/browser tests and strict types; commit.

### Task 3: Interactive live map and release
**Files:** modify `PartnerLiveOperations.tsx`, `PartnerLiveOperationsMap.tsx`; add browser coverage in `scripts/partner-operations-browser-test.mjs`; wire new tests into regression/E2E scripts.
**Interfaces:** Map accepts `selectedTripId`, `onSelectTrip`; safe popups/markers preserve viewport during refresh and validate finite lng/lat ranges. Page uses shared scope, existing freshness and lightweight live service.
- [x] Add failing tests for selection, empty map persistence, safe labels, coordinate rejection and organization-switch races.
- [x] Implement linked trip cards/markers, refresh timestamp, hidden-tab polling pause, recoverable map errors and stable mounted map.
- [ ] Run lint, full regression/build/browser suites and independent whole-branch review. Fix Important findings.
- [ ] Create PR, pass protected CI, merge and verify GitHub Pages public release/backend and isolated browser checks; report real-account/GPS limits.
