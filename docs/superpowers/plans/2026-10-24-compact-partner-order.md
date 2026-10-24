# Compact Partner Order Implementation Plan

> **For agentic workers:** Use native execution in the existing session.

**Goal:** Make the existing mobile Partner order short and navigable without losing data or weakening draft validation.
**Architecture:** Keep the existing payload and road component; retain all form fields in mounted hidden step panels. Validate steps before navigation, review current form values before the sole save action.
**Tech Stack:** Existing React, TypeScript, Tailwind, Playwright.
**Spec:** docs/superpowers/specs/2026-10-24-compact-partner-order-design.md

## Global Constraints
- Existing database, draft RPC, admin approval, payment and Smart Order flag behavior remain unchanged.
- Required fields remain required. No production test writes.

## Review Focus
- Back/Next preserves optional, selected route and typed input values.
- Enter never bypasses review or saves an incomplete draft.
- Invalid fields on an earlier or collapsed panel are revealed and focused.
- Route failure or changed destination prevents progression/save.
- At 320px, date/time, long headings and footer fit the viewport.

### Task 1: Compact form and browser proof
- [x] Adapt the real form/route browser test for validation, four-step navigation, persistence, review and sole final draft RPC. Observe failure.
- [x] Implement compact mounted steps and optional disclosures in src/pages/PartnerOrderNew.tsx. Shorten PartnerOrders heading copy/spacing.
- [ ] Build CSS and run browser proof at 320/390/768px, lint, regression and production build.
- [ ] Publish PR, run protected CI, merge and verify public GitHub Pages assets. Report verification limits.
