# HALLO Shipper Orders and Customer Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver compact, localized Customer order/date presentation and a reliable order-scoped Customer ↔ Driver chat inside HALLO Shipper.

**Architecture:** Reuse the existing Customer-owned order, assignment, chat RPC, RLS, and Realtime contracts. Add pure date/view-model helpers for testability, then keep UI work within existing Orders, Details, Chat, copy, and Android-responsive files.

**Tech Stack:** React 19, TypeScript, Supabase JS/Reatime, CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-06-hallo-shipper-capacitor-messaging-design.md`

## Global Constraints

- Customer chat is available only for an owned order with a verified Driver assignment.
- Existing RPCs and participant RLS remain authoritative; no migration or policy change.
- Service date, created timestamp, and current status are distinct.
- Missing/invalid dates display localized Pending; stored values are never rewritten.
- Message bodies are 1–4,000 trimmed characters.
- Target widths are 320, 360, 390, and 412 CSS pixels.
- EN, Afaan Oromoo, and Amharic remain supported.

## Review Focus

- Invalid, timezone-sensitive, and missing service dates must not shift a day or show “Invalid Date”; Task 1 tests them.
- A reassigned/unassigned order must hide chat even if stale assignment UI exists; Task 2 tests verified assignment gating.
- A failed send must preserve the draft and must not render it as delivered; Task 2 tests failure behavior.
- Realtime reconnects must not create duplicate messages or leaked channels; Task 2 tests cleanup/idempotent rendering.
- Long tracking IDs, route names, Amharic copy, and the keyboard must not overflow or hide the composer; Task 3 covers responsive smoke.

---

### Task 1: Localized order-date model

**Files:**
- Create: `apps/customer-mobile-app/src/customer-order-date.ts`
- Create: `apps/customer-mobile-app/tests/customer-order-date.test.mjs`
- Modify: `apps/customer-mobile-app/tsconfig.policy.json`
- Modify: `apps/customer-mobile-app/src/customer-final-copy.ts`

**Interfaces:**
- Produces: `formatCustomerServiceDate(value: string | null | undefined, language: CustomerLanguage): string`.
- Produces: `formatCustomerCreatedAt(value: string | null | undefined, language: CustomerLanguage): string`.
- Dates represented as `YYYY-MM-DD` are formatted as calendar dates without UTC day shifts.

- [ ] **Step 1: Write failing pure-function tests**

Cover valid service dates in EN/OR/AM, leap day, invalid input, empty input, and a timestamp near a timezone boundary. Assert invalid/missing input returns the locale's existing Pending copy.

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/customer-mobile-app && npm test -- --test-name-pattern="customer order date"`  
Expected: FAIL because the module/functions are missing.

- [ ] **Step 3: Implement the minimal date helpers and localized copy**

Parse date-only values by components rather than `new Date("YYYY-MM-DD")`; use explicit locale mappings `en-US`, `om-ET`, and `am-ET`.

- [ ] **Step 4: Verify GREEN and typecheck**

Run: `cd apps/customer-mobile-app && npm test && npm run typecheck`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-mobile-app/src/customer-order-date.ts apps/customer-mobile-app/tests/customer-order-date.test.mjs apps/customer-mobile-app/tsconfig.policy.json apps/customer-mobile-app/src/customer-final-copy.ts
git commit -m "feat(shipper): localize order dates"
```

### Task 2: Secure Customer ↔ Driver chat behavior

**Files:**
- Modify: `apps/customer-mobile-app/src/customer-driver-chat.service.ts`
- Modify: `apps/customer-mobile-app/src/CustomerDriverChat.tsx`
- Modify: `apps/customer-mobile-app/src/CustomerOrderDetailsPage.tsx`
- Create: `apps/customer-mobile-app/tests/customer-driver-chat.test.mjs`
- Modify: `apps/customer-mobile-app/tests/customer-final-ui.test.mjs`

**Interfaces:**
- Consumes: existing `open_customer_driver_order_chat`, `send_customer_driver_chat_message`, and `mark_customer_driver_chat_read`.
- Produces: `CustomerDriverChat` with explicit order/recipient header, retained draft on error, Realtime cleanup, and verified-assignment entry.
- Produces: no optimistic “delivered” message before server confirmation.

- [ ] **Step 1: Write failing service and UI contract tests**

Assert expected-user session verification, 4,000-character validation, `crypto.randomUUID()`, RPC names, participant-scoped table reads, channel cleanup, draft retention on send error, and chat action hidden without `assignment.driver_id`.

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/customer-mobile-app && node --test tests/customer-driver-chat.test.mjs tests/customer-final-ui.test.mjs`  
Expected: FAIL on the new validation, recipient context, and assignment gate assertions.

- [ ] **Step 3: Implement minimal service hardening**

Keep existing RPC signatures. Return the confirmed message ID, reject blank/oversized input before RPC, verify the active session matches `userId`, and expose a cleanup function that always removes its Realtime channel.

- [ ] **Step 4: Implement the chat UI behavior**

Show Driver name plus tracking ID, loading/empty/error/retry states, chronological bubbles, explicit sending disabled state, and retain `text` when send fails. Open chat only from a verified assignment.

- [ ] **Step 5: Verify GREEN and full suite**

Run: `cd apps/customer-mobile-app && npm run test:ci`  
Expected: all Customer tests, typecheck, and build PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-mobile-app/src/customer-driver-chat.service.ts apps/customer-mobile-app/src/CustomerDriverChat.tsx apps/customer-mobile-app/src/CustomerOrderDetailsPage.tsx apps/customer-mobile-app/tests/customer-driver-chat.test.mjs apps/customer-mobile-app/tests/customer-final-ui.test.mjs
git commit -m "feat(shipper): harden assigned Driver chat"
```

### Task 3: Smart order cards and responsive chat

**Files:**
- Modify: `apps/customer-mobile-app/src/CustomerOrdersV4Page.tsx`
- Modify: `apps/customer-mobile-app/src/CustomerOrderDetailsPage.tsx`
- Modify: `apps/customer-mobile-app/src/customer-final-ui.css`
- Modify: `apps/customer-mobile-app/src/customer-android-responsive.css`
- Modify: `apps/customer-mobile-app/tests/customer-final-ui.test.mjs`
- Create: `apps/customer-mobile-app/scripts/customer-mobile-responsive-smoke.mjs`
- Modify: `apps/customer-mobile-app/package.json`

**Interfaces:**
- Consumes: Task 1 date helpers and Task 2 chat gate.
- Produces: compact order cards with tracking ID, route, status, service date, payment state, and next action.
- Produces: browser smoke command `npm run smoke:responsive`.

- [ ] **Step 1: Write failing UI and responsive assertions**

Require date helper usage in Orders/Details, separate Created/Service Date labels, no raw `service_date`, chat composer safe-area padding, 44px actions, text wrapping, and responsive screenshot/DOM checks at 320/360/390/412.

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/customer-mobile-app && node --test tests/customer-final-ui.test.mjs && npm run smoke:responsive`  
Expected: FAIL because the new date hierarchy and smoke script are absent.

- [ ] **Step 3: Refactor order cards to the specified hierarchy**

Use the Task 1 formatter; retain the authoritative query order and all existing order actions. Keep long route/tracking values inside `min-width: 0` containers with wrapping/clamping.

- [ ] **Step 4: Add IME/safe-area chat CSS**

Use a fixed inset dialog within the 430px stage, a scrollable message region, sticky composer with `env(safe-area-inset-bottom)`, and 16px inputs. Do not use native `select` for chat context.

- [ ] **Step 5: Implement and run responsive smoke**

Render authenticated fixture states at 320, 360, 390, and 412; assert no horizontal overflow, visible composer, visible bottom nav, and distinct order dates.

- [ ] **Step 6: Verify full Customer gates**

Run: `cd apps/customer-mobile-app && npm run test:ci && npm run smoke:responsive`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-mobile-app/src/CustomerOrdersV4Page.tsx apps/customer-mobile-app/src/CustomerOrderDetailsPage.tsx apps/customer-mobile-app/src/customer-final-ui.css apps/customer-mobile-app/src/customer-android-responsive.css apps/customer-mobile-app/tests/customer-final-ui.test.mjs apps/customer-mobile-app/scripts/customer-mobile-responsive-smoke.mjs apps/customer-mobile-app/package.json
git commit -m "feat(shipper): polish orders and mobile chat"
```

### Task 4: Authenticated device smoke

**Files:**
- Modify: `apps/customer-mobile-app/design-qa.md`

**Interfaces:**
- Consumes: Tasks 1–3 and the Capacitor plan.
- Produces: device evidence for Customer → Driver message delivery.

- [ ] **Step 1: Install the fresh HALLO Shipper debug APK**

Uninstall the old package, install the new debug APK, and launch `com.hallotruck.shipper/.MainActivity`.

- [ ] **Step 2: Exercise the authenticated flow**

Open Orders, verify localized dates, open an assigned order, send a message, background/reopen, and verify the thread remains correct.

- [ ] **Step 3: Capture logcat and screenshots**

Assert no fatal/Capacitor console error; capture the Orders card, Order Details, empty/loading/error states where practical, open chat, keyboard-open composer, and sent reply.

- [ ] **Step 4: Commit evidence notes**

```bash
git add apps/customer-mobile-app/design-qa.md
git commit -m "docs(shipper): record order chat device smoke"
```
