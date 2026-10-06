# Driver Unified Message Inbox Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Driver app’s Operations-only chat launcher with one secure inbox whose Operations and Customer channels are unmistakably separate, order-aware, realtime, responsive, and safe against wrong-recipient sends.

**Architecture:** Keep the existing Operations service and the existing `customer_driver_order_chat` database/RPC/RLS contract. Add a Driver-side customer-chat adapter and a small normalized inbox model, then compose both into one UI shell. Do not add a Supabase migration, broaden RLS, duplicate messages, or expose Customer threads to an unassigned Driver.

**Tech Stack:** React, TypeScript, Vite, Supabase JS, Capacitor Android, Node test runner, Playwright/browser smoke tests, Android device smoke tests.

---

## Global constraints

- Operations and Customers must differ by label, icon, metadata, color treatment, recipient bar, empty state, and unread badge—not color alone.
- Every send must bind to the currently visible recipient and context. Switching channel/thread with a non-empty draft must preserve the draft per conversation or require explicit discard.
- Customer conversations are scoped to an order and the currently approved assigned Driver under existing RLS.
- Keep message length at the server-supported maximum of 4,000 characters and show actionable validation/network errors.
- Use realtime subscriptions with deterministic cleanup and deduplication.
- No Supabase schema migration or RLS weakening is part of this plan.
- All visible copy must support English, Afaan Oromo, and Amharic.
- UI must remain usable at 320, 360, 390, and 412 px widths, with the Android keyboard open and safe-area insets applied.

### Task 1: Add the Driver customer-conversation service and normalized inbox model

**Files:**
- Create: `apps/driver-mobile-app/src/driver/driver-customer-chat.service.ts`
- Create: `apps/driver-mobile-app/src/driver/driver-message-inbox.model.ts`
- Create: `apps/driver-mobile-app/tests/driver-customer-chat.service.test.mjs`
- Reference: `apps/customer-mobile-app/src/customer-driver-chat.service.ts`
- Reference: `supabase/migrations/20260904211000_customer_driver_order_chat.sql`
- Reference: `mobile/driver/android/app/src/main/java/com/hallo/logistics/driver/DriverCommunicationsRepository.kt`

- [ ] **Step 1: Write failing contract tests for Driver customer chat**

Cover expected-user session validation, assigned-thread listing, stable ordering by `last_message_at`, order/tracking metadata, message normalization, 4,000-character validation, unread derivation, and realtime deduplication/cleanup.

Run: `node --test apps/driver-mobile-app/tests/driver-customer-chat.service.test.mjs`  
Expected: FAIL because the service/model do not exist.

- [ ] **Step 2: Implement normalized inbox types and pure helpers**

Define channel/thread/message view models, stable sort and dedupe helpers, unread-count rules, safe customer display-name fallback, and order-context formatting without coupling UI components to raw Supabase rows.

- [ ] **Step 3: Implement the Driver customer-chat adapter**

Validate `expectedUserId`; list only threads available through existing RLS and matching the signed-in Driver; resolve approved order/customer context through existing secure contracts; call the existing open/send/mark-read RPCs; fetch ordered messages; subscribe to inserts/updates; and unsubscribe cleanly.

- [ ] **Step 4: Run service tests to GREEN**

Run: `node --test apps/driver-mobile-app/tests/driver-customer-chat.service.test.mjs`  
Expected: PASS, with no network calls leaking across tests.

- [ ] **Step 5: Commit**

```bash
git add apps/driver-mobile-app/src/driver/driver-customer-chat.service.ts apps/driver-mobile-app/src/driver/driver-message-inbox.model.ts apps/driver-mobile-app/tests/driver-customer-chat.service.test.mjs
git commit -m "feat(driver): add secure customer chat adapter"
```

### Task 2: Build the unified Operations | Customers inbox shell

**Files:**
- Create: `apps/driver-mobile-app/src/driver/DriverMessageInbox.tsx`
- Create: `apps/driver-mobile-app/tests/driver-message-inbox.test.mjs`
- Modify: `apps/driver-mobile-app/src/driver/DriverOperationsChatLauncher.tsx`
- Modify: `apps/driver-mobile-app/src/DriverWorkspace.tsx`
- Modify: `apps/driver-mobile-app/src/driver/driver-v4-i18n.ts`
- Reference: `apps/driver-mobile-app/src/driver/driver-chat.service.ts`

- [ ] **Step 1: Write failing UI contract tests**

Assert one launcher, exactly two top-level channels, separate unread badges, distinct accessible names/icons, recipient-bar copy, Customer tracking/order context, Operations adapter reuse, and no duplicate sign-out or chat controls.

Run: `node --test apps/driver-mobile-app/tests/driver-message-inbox.test.mjs`  
Expected: FAIL because the unified inbox is not wired.

- [ ] **Step 2: Build the inbox shell and channel state**

Add `Operations` and `Customers` tabs. Operations uses the existing secure service and navy/gold shield/headset treatment. Customers uses customer/avatar fallback plus order/truck treatment, tracking ID, route/status, and its own unread badge.

- [ ] **Step 3: Add explicit recipient and draft protection**

Pin a recipient bar above the composer: `To HALLO Operations` or `To {Customer} · {Tracking ID}`. Keep independent drafts per Operations and Customer thread, or require explicit discard before replacing a non-empty draft. Disable send until a valid recipient/thread is selected.

- [ ] **Step 4: Wire one launcher into DriverWorkspace**

Replace the Operations-only workspace entry with `DriverMessageInbox`. Retain `DriverOperationsChatLauncher` only as an internal Operations panel/adapter if that reduces duplication; it must no longer render a second independent launcher.

- [ ] **Step 5: Add EN/OR/AM inbox copy**

Translate channel names, recipient labels, empty/loading/error states, unread labels, draft-discard confirmation, order context, composer placeholders, and send actions.

- [ ] **Step 6: Run inbox and existing parity tests**

Run:
```bash
node --test apps/driver-mobile-app/tests/driver-message-inbox.test.mjs
node --test apps/driver-mobile-app/tests/driver-portal-parity.test.mjs
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/driver-mobile-app/src/driver/DriverMessageInbox.tsx apps/driver-mobile-app/src/driver/DriverOperationsChatLauncher.tsx apps/driver-mobile-app/src/DriverWorkspace.tsx apps/driver-mobile-app/src/driver/driver-v4-i18n.ts apps/driver-mobile-app/tests/driver-message-inbox.test.mjs
git commit -m "feat(driver): unify operations and customer inbox"
```

### Task 3: Replace the oversized order picker and harden mobile layout

**Files:**
- Modify: `apps/driver-mobile-app/src/driver/DriverMessageInbox.tsx`
- Modify: `apps/driver-mobile-app/src/driver-v4.css`
- Modify: `apps/driver-mobile-app/src/driver-android-responsive.css`
- Create: `apps/driver-mobile-app/scripts/driver-message-inbox-smoke.mjs`
- Modify: `apps/driver-mobile-app/package.json`

- [ ] **Step 1: Add failing responsive/sheet smoke assertions**

Assert no native full-screen `select` is used for order context, the support header does not overlap page content, the composer remains visible with the IME open, and long customer/tracking/Amharic strings wrap without horizontal overflow.

Run: `npm.cmd --prefix apps/driver-mobile-app run test:message-inbox-smoke`  
Expected: FAIL until the script and responsive layout are implemented.

- [ ] **Step 2: Build an in-app Customer conversation sheet**

Use a controlled bottom sheet/dialog with focus trapping, Escape/Android-back close behavior, compact rows, customer name, tracking ID, status, route, unread count, and a bounded scroll area. Do not rely on the native HTML select picker shown in the reported screenshot.

- [ ] **Step 3: Fix support-panel geometry**

Keep the header, channel tabs, thread list, message history, recipient bar, and composer within the viewport; honor top/bottom safe areas; prevent the overlay from exposing or overlapping unrelated profile content; and keep touch targets at least 44 px.

- [ ] **Step 4: Add responsive browser smoke coverage**

Exercise 320×640, 360×800, 390×844, and 412×915; both channels; long labels; empty/error/loading states; draft-switch protection; and simulated keyboard viewport shrink.

- [ ] **Step 5: Run smoke and full Driver checks**

Run:
```bash
npm.cmd --prefix apps/driver-mobile-app run test:message-inbox-smoke
npm.cmd --prefix apps/driver-mobile-app test
npm.cmd --prefix apps/driver-mobile-app run build
```
Expected: PASS with no horizontal overflow or uncaught console error.

- [ ] **Step 6: Commit**

```bash
git add apps/driver-mobile-app/src/driver/DriverMessageInbox.tsx apps/driver-mobile-app/src/driver-v4.css apps/driver-mobile-app/src/driver-android-responsive.css apps/driver-mobile-app/scripts/driver-message-inbox-smoke.mjs apps/driver-mobile-app/package.json
git commit -m "fix(driver): harden unified inbox mobile layout"
```

### Task 4: Verify authenticated Customer ↔ Driver and Operations flows

**Files:**
- Modify if necessary: `apps/driver-mobile-app/tests/driver-message-inbox.test.mjs`
- Evidence only: Android screenshots and filtered log output (do not commit credentials or private message content)

- [ ] **Step 1: Build and sync the Driver Android app**

Run:
```powershell
Set-Location 'C:\Users\HP\StudioProjects\hallotruck\apps\driver-mobile-app'
npm.cmd ci
npm.cmd run android:sync
```
Expected: Capacitor build verification and sync succeed.

- [ ] **Step 2: Install a clean debug build**

Run:
```powershell
Set-Location '.\android'
adb devices -l
adb uninstall com.hallotruck.driver
.\gradlew.bat installDebug
adb shell am start -W -n com.hallotruck.driver/.MainActivity
```
Expected: one authorized device, successful install, cold launch.

- [ ] **Step 3: Exercise Customer ↔ Driver messaging**

With approved test accounts and one assigned order: Customer sends a message; Driver sees it under Customers with the correct customer/order metadata and unread badge; Driver replies; Customer receives the reply; opening each thread marks it read. Verify reassigned/unassigned orders are not exposed.

- [ ] **Step 4: Exercise Driver ↔ Operations messaging**

Send and receive an Operations message, confirm its unread badge and recipient bar remain independent from Customer messages, and confirm switching tabs cannot send the existing draft to the other recipient.

- [ ] **Step 5: Check logs and screenshots**

Run:
```powershell
adb logcat -c
# Repeat the critical flows.
adb logcat -d -v time | Select-String -Pattern 'Capacitor/Console|TypeError|ReferenceError|ERR_|FATAL EXCEPTION|customer_driver_chat'
```
Expected: no JavaScript exception, fatal crash, permission leak, duplicate realtime delivery, or wrong-recipient send.

- [ ] **Step 6: Run final repository checks and commit any test-only correction**

Run:
```bash
npm.cmd --prefix apps/driver-mobile-app test
npm.cmd --prefix apps/driver-mobile-app run build
git status --short
```
Expected: all checks pass and only intended files are changed.

## Review Focus

Before implementation is considered complete, explicitly re-check:

1. **Draft switching:** a non-empty Operations draft cannot become a Customer message, and drafts for two Customer threads cannot cross.
2. **Assignment changes:** stale/reassigned Customer threads disappear or become non-sendable without leaking customer data.
3. **Unread correctness:** per-channel and per-thread counts agree after realtime inserts, reconnects, and mark-read updates.
4. **Realtime lifecycle:** opening/closing/switching the inbox does not create duplicate events or leaked subscriptions.
5. **Small-screen safety:** long names, tracking IDs, Amharic text, order lists, safe areas, and the Android keyboard never hide the recipient or send controls.
