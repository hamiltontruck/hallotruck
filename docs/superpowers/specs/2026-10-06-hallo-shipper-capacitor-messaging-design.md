# HALLO Shipper Capacitor and Unified Messaging Design

Date: 2026-10-06  
Status: Draft for user review  
Branch: `feat/hallo-shipper-capacitor-messaging-20261006`

## 1. Outcome

Convert the existing React/Vite Customer mobile application at `apps/customer-mobile-app/` into a production-ready Android Capacitor application named **HALLO Shipper**, while preserving the current production Customer authentication, order, pricing, payment, tracking, and Supabase authorization contracts.

Complete the messaging experience across the two Capacitor applications:

- Driver ↔ Admin/CEO Operations chat remains available.
- Customer ↔ assigned Driver chat remains order-scoped.
- Driver sees both channels through one mobile inbox with **Operations** and **Customers** tabs.
- Customer opens Driver chat only from an owned order with a verified assignment.

The existing native Kotlin project under `mobile/customer/android/` is not modified or merged into the Capacitor application.

## 2. Scope

### HALLO Shipper Capacitor

- Add Capacitor Android support to `apps/customer-mobile-app/`.
- Use application ID `com.hallotruck.shipper`.
- Use display name `HALLO Shipper`.
- Use the existing Vite `dist` output as the Capacitor web directory.
- Use relative production asset paths so the same build works in GitHub Pages and the Capacitor WebView.
- Add the generated Android project, deterministic sync commands, dependency lockfile updates, build verification, and Android CI.
- Preserve Customer role verification and fail closed when session or role checks fail.
- Inject only publishable client configuration; never package a Supabase secret/service-role key.

### HALLO Shipper launcher artwork

- Use the approved HALLO Shipper artwork supplied by the user.
- Reframe it for a square 512 × 512 source with the driver, truck, route pin, and exact **HALLO SHIPPER** wording inside the Android adaptive-icon circular safe zone.
- Generate legacy, round, and adaptive Android launcher resources deterministically.
- Keep the optimized icon small enough not to inflate the APK through duplicated launcher resources.
- Add a regression assertion for the approved icon checksum and generated resource contract.

### Messaging

- Keep the existing Admin ↔ Driver and Customer ↔ Driver database contracts separate.
- Present them through one Driver inbox:
  - **Operations** tab: existing `driver_chat_threads` / `driver_chat_messages` contract.
  - **Customers** tab: existing order-scoped `customer_driver_chat_threads` / `customer_driver_chat_messages` contract.
- Do not merge the two schemas or copy messages between them.
- Customer messages are available only for Customer-owned orders assigned to the signed-in Driver.
- Operations messages may attach an eligible Driver order as context.
- Customer messages always inherit their thread's order context and cannot be moved to another order.
- Make the two channels unmistakable without relying on color alone:
  - **Operations** uses the HALLO Operations name, verified shield/headset icon, navy/gold treatment, and its own unread badge.
  - **Customers** uses the Customer name/avatar fallback, order/truck icon, tracking ID, route/status context, and its own unread badge.
  - The composer always shows a persistent recipient bar: **To HALLO Operations** or **To {Customer} · {Tracking ID}**.
  - Switching tabs clears the draft or asks before discarding non-empty text so a message cannot be sent to the wrong recipient.
- Show loading/empty/error/retry states, chronological messages, sent/seen state where the authoritative contract provides it, and an IME-safe composer.
- Replace the oversized platform order picker shown in the supplied screenshot with a compact in-app order-context sheet/list.
- Keep message bodies limited to 4,000 characters and retain server-generated authorization as the source of truth.

### Customer order and date presentation

- Format `service_date` in the active language instead of exposing raw database text.
- Clearly distinguish:
  - service/order date,
  - created timestamp,
  - current status.
- Order cards show tracking ID, route, service date, status, payment state, and the next relevant action without horizontal overflow.
- Sort the primary order list using the existing authoritative query order; formatting must not rewrite stored dates.
- Order details expose Call Driver and Message Driver only when a verified assignment exists.
- Preserve cancellation, payment, invoice, quote, GPS, and tracking semantics.

### Responsive Android UX

Target widths: 320, 360, 390, and 412 CSS pixels.

Required behavior:

- no horizontal overflow;
- safe-area-aware header and bottom navigation;
- keyboard/IME does not hide the message composer or authentication inputs;
- chat header, tabs, messages, and composer remain within the viewport;
- bottom navigation does not cover page actions;
- order context uses an accessible in-app sheet instead of a full-screen native select;
- touch targets are at least 44 CSS pixels;
- EN, Afaan Oromoo, and Amharic layouts remain usable.

## 3. Existing contracts and security

This project reuses the current production contracts:

- Supabase Auth and Customer/Driver role checks;
- Customer order ownership rules;
- `open_customer_driver_order_chat`;
- `send_customer_driver_chat_message`;
- `mark_customer_driver_chat_read`;
- Driver Operations chat RPCs;
- existing Realtime subscriptions;
- existing orders, assignment, payment, quote, tracking, and storage policies.

No Supabase migration, RLS weakening, new public table, or service-role client is included in this scope.

If the existing participant-scoped RLS cannot securely list the signed-in Driver's Customer threads, implementation stops and reports the exact contract blocker. It must not add a broad `TO authenticated` policy or client-side-only authorization as a workaround.

Every client action revalidates the authenticated user against the expected Customer or Driver ID before reading or writing data.

## 4. Component boundaries

### Customer application

- `CustomerDriverChat`: order-scoped conversation UI.
- Customer chat service: session validation, existing RPC calls, message reads, read receipts, Realtime lifecycle.
- Orders and Order Details: localized date formatter and verified-assignment chat entry.
- Capacitor configuration and Android resources: packaging only; no business logic.
- Icon generation script: deterministic launcher resource creation.

### Driver application

- `DriverMessageInbox`: shared dialog shell, visually distinct Operations/Customers tabs, separate unread badges, explicit recipient bar, focus management, responsive layout.
- Operations conversation adapter: wraps the existing Operations chat service.
- Customer conversation adapter: loads assigned order threads and uses the existing Customer ↔ Driver contract.
- Order-context sheet: compact eligible-order selection for Operations messages.
- Customer thread list: tracking ID, Customer/order context, last message, timestamp, and unread state.

The two adapters expose a small common view model to the inbox but retain separate Supabase calls and message types.

## 5. Data flow

### Customer to Driver

1. Customer opens an owned assigned order.
2. Client verifies the active Customer session.
3. Existing order-chat RPC returns or creates the order-scoped thread.
4. Existing RLS exposes only that Customer and assigned Driver.
5. Message is sent through the existing append-only RPC.
6. Realtime INSERT refreshes the Customer and Driver views.
7. Read receipt is updated through the existing read RPC.

### Driver to Operations

1. Driver opens Messages → Operations.
2. Client verifies the active Driver session.
3. Existing Driver Operations thread and messages load.
4. Driver may attach one eligible order using the compact context sheet.
5. Message is sent through the existing Operations RPC.
6. Realtime updates messages and read state.

### Driver to Customer

1. Driver opens Messages → Customers.
2. Participant-scoped existing threads for assigned orders load.
3. Driver selects one order conversation.
4. Message is sent through the existing Customer ↔ Driver RPC.
5. Realtime refreshes both participants.

## 6. Error handling

- Missing/expired session: close protected data and return to sign-in.
- Role mismatch: fail closed; no workspace is rendered.
- Thread unavailable or assignment changed: show a non-destructive error and reload the order.
- Realtime unavailable: preserve manual refresh/poll fallback without duplicating messages.
- Duplicate send: retain client message IDs and server idempotency.
- Offline/network error: keep the typed draft, show Retry, and never display an unsent message as delivered.
- Invalid or missing service date: display localized “Pending”; do not invent a date.
- Missing verified assignment: hide Customer ↔ Driver chat action.

## 7. Accessibility

- Dialogs use a labelled modal structure and restore focus to the launcher on close.
- Tabs expose selected state, text labels, icons, and separate unread counts; channel identity never depends on color alone.
- The active recipient and order are announced before the composer.
- Message list announces new messages without repeatedly reading the full history.
- Error text uses alert semantics.
- Status is never communicated by color alone.
- Dates have readable localized text.
- Icon-only actions have localized accessible labels.
- Android back closes the top sheet/dialog before leaving the current page.

## 8. Testing strategy

Implementation follows red-green-refactor TDD.

### Automated

- Customer Capacitor configuration and local-asset verification.
- Customer role/session fail-closed behavior.
- Customer ↔ Driver order ownership and assignment gates.
- Driver unified inbox adapter separation, channel identity, recipient bar, per-tab unread badges, and wrong-recipient draft protection.
- Operations order-context eligibility.
- Message validation, read state, Realtime cleanup, and retry behavior.
- Localized service-date formatting, including invalid/missing dates.
- HALLO Shipper app name, application ID, icon checksum, adaptive resources, and required Android manifest entries.
- Responsive DOM/browser smoke at 320/360/390/412.
- Existing Customer, Driver, root CI, typecheck, and builds remain green.
- Android Gradle unit/lint/debug APK workflow.

### Physical device

On the PHW110 Android 15 device:

1. Fresh install HALLO Shipper.
2. Sign in as Customer.
3. Open Orders and verify smart service-date cards.
4. Open an assigned order and send a Customer message.
5. Open Driver app Messages → Customers and receive/reply.
6. Open Messages → Operations and send an order-context message.
7. Verify Admin receives and replies.
8. Verify unread/read state.
9. Exercise EN/OR/AM.
10. Exercise keyboard, back, safe areas, and 320–412 equivalent layouts.
11. Confirm no crash, ANR, or meaningful logcat error.
12. Confirm launcher artwork is not cropped by round/adaptive masks.

## 9. Delivery and merge gates

- Work occurs on a dedicated branch and PR.
- No unrelated Customer portal, Admin, Finance, pricing, GPS, migration, or production-data changes.
- No merge until all automated checks pass.
- No merge until Customer ↔ Driver and Driver ↔ Admin authenticated device smoke evidence passes.
- Generated Android changes must be reproducible through the committed sync/icon commands.
- Final PR documents APK size, checksum, test counts, and device evidence.

## 10. Non-goals

- Replacing Supabase with a new messaging backend.
- Combining Admin and Customer message tables.
- Adding attachments, voice messages, typing indicators, or group chat.
- Rewriting the native Kotlin Customer application.
- Changing order pricing, payment ledger, commission, GPS truth rules, or Admin authorization.
