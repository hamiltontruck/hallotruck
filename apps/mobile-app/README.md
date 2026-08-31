# HALO Driver + Customer Mobile Workspace

This directory is an isolated Tailwind CSS v4 workspace for the HALLO Logistics Driver and Customer mobile experience.

## Scope

- Driver home, database-backed available jobs, active-trip summary, wallet, and production profile/compliance status.
- Customer home, shipment booking, live order map, payments, and profile shell.
- HALO blue-and-gold mobile design tokens.
- Full-height mobile map experience with safe-area-aware navigation.
- Afaan Oromoo-first sample interface.

## Isolation guarantee

The existing production web application remains in the repository root and continues to use Tailwind CSS v3.4. This mobile workspace has its own `package.json`, Vite configuration, Tailwind v4 dependency, CSS entry point, and build output. It does not import or modify the Admin, CEO, Finance, Partner, Operations, RLS, payment, or production order-workflow code.

## Run locally

```bash
cd apps/mobile-app
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## Current implementation status

The responsive UI shell includes a secure Supabase authentication boundary. Email/password sessions are restored in isolated mobile storage, and the workspace is selected only from `profiles.role` plus `driver_status` in the database.

The Driver Jobs workspace is database-backed:

- reads the signed-in driver's active `accepted` or `in_transit` order under existing RLS;
- loads marketplace jobs only through the canonical `get_available_jobs()` RPC;
- loads compatible owned trucks through `driver_available_trucks_for_order()`;
- claims a load only through `claim_order_with_truck()`;
- preserves server enforcement for driver approval, truck ownership/type/capacity, document validity, active-trip exclusion and commission settlement;
- refreshes periodically and reacts to changes on the signed-in driver's orders.

Driver Active Trip reads the assigned order, route geometry and navigation instructions from production services. GPS remains offline-safe and shows `in_transit` only after server confirmation. An In Transit Driver can now capture the delivery photo, receiver name and signature, report the customer-selected payment outcome, and complete the order through the existing atomic `driver_finish_trip` RPC. Driver Wallet now reads the signed-in Driver's financial summary, commission position and completed-trip payment results from existing self-scoped production sources. Driver Profile now reads the signed-in Driver's account, assigned trucks and identity/vehicle verification status from existing RLS-protected tables. Customer booking, Customer payments and Customer live tracking remain separate integration slices.

## Design constraints

- Minimum supported viewport: 320 px.
- Bottom navigation includes `env(safe-area-inset-bottom)` support.
- Touch targets are at least approximately 40–44 px.
- Focus-visible states and reduced-motion preferences are supported.
- No style from this package is loaded by the existing root application.

## Mobile authentication boundary

- Requires `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`.
- Never accepts a service-role key in the browser bundle.
- Does not trust `user_metadata` or a user-controlled role switch.
- Reads `profiles.role`, `profiles.driver_status` and `profiles.full_name` under the signed-in user's existing RLS policy.
- Allows Customer accounts and approved Driver accounts only.
- Keeps pending/rejected Drivers in onboarding, blocks suspended Drivers, and denies Admin/CEO/Partner accounts.
- Uses a dedicated `hallo-mobile-auth-v1` storage key so the mobile workspace does not inherit a leadership session from the root web portal.
- Covers the role decision contract with deterministic Node tests in Mobile App CI.


## Driver Active Trip boundary

- Reads only the signed-in Driver's `accepted` or `in_transit` order under existing Orders RLS.
- Loads route geometry and instructions through the authenticated `navigation` Edge Function.
- Sends high-accuracy browser GPS through the authenticated `tracking` Edge Function.
- Keeps the database order `accepted` while a GPS ping is only queued offline.
- Re-reads the assigned order after every successful ping before showing `in_transit` or live status.
- Stores at most 20 queued pings per Driver/order under the isolated `hallo-mobile-driver-gps-v1` key.
- Syncs queued pings when connectivity returns and preserves authorization/lifecycle failures for the Driver.
- Stops and clears stale GPS work when the order is no longer assigned or active.
- Uses real route geometry in a lightweight SVG route viewport; a full tile basemap remains a later renderer slice.


## Driver Delivery Proof boundary

- Appears only for the signed-in Driver's `in_transit` order.
- Uses mobile rear-camera capture or gallery selection; images must be under 8 MB.
- Requires receiver name, delivery photo and pointer/touch signature.
- Restricts payment outcomes to the customer's database-selected Cash or Bank / Telebirr method, plus Payment not received.
- Requires the exact invoice amount for cash collected by the Driver.
- Does not queue delivery or financial mutations offline.
- Uploads proof files only to the private `delivery-proofs` bucket under the order ID.
- Calls the existing authenticated `driver_finish_trip` RPC so proof, Delivered status and payment result remain one server transaction.
- Reconciles ambiguous retry outcomes against `delivery_proofs` before deleting uploaded files.
- Stops live GPS and clears order-scoped queued pings after successful completion.


## Driver Wallet boundary

- Uses `driver_financial_summary(p_driver_id)` for released earnings, deposits and commission due.
- Uses `my_driver_commission_summary()` for the Driver's current commission and job-lock position.
- Reads recent immutable `driver_trip_payment_results` only for the signed-in assigned Driver.
- Loads financial, commission and trip-history sources independently so one failure does not blank the others.
- Preserves the last confirmed values during transient refresh failures and rejects stale refresh responses.
- Refreshes on Driver-filtered realtime changes and coalesces overlapping refresh events.
- Allows the approved signed-in Driver to submit a commission payment through the existing `submit_driver_commission_payment` RPC.
- Uploads JPG, PNG, WebP or PDF receipts up to 10 MB to the private `driver-commission-receipts` bucket under the Driver's own ID.
- Subtracts already-pending submissions from the client-side payable amount while leaving the server RPC authoritative.
- Shows recent pending, approved and rejected submissions, including the Admin/CEO rejection reason.
- Prevents overlapping form submissions and refreshes wallet totals after successful submission or realtime review changes.
- Does not approve payments, alter commission charges, modify deposits, create payouts or mutate ledger history.


## Driver Profile boundary

- Reads only the signed-in Driver's `profiles` row and requires the database role to remain Driver.
- Reads only trucks whose `driver_id` matches the authenticated Driver under existing Trucks RLS.
- Reads only the Driver's own `driver_verification_files` rows under existing verification RLS.
- Shows database Driver status, rating, preferred vehicle, assigned truck details and 5 identity plus 7 vehicle checklist items.
- Treats missing, pending, rejected, verified and expired documents as different states; expired evidence never counts as verified.
- Loads profile, truck and document sources independently and preserves each last confirmed snapshot during transient failures.
- Refreshes periodically and on Driver-filtered realtime changes while coalescing overlapping refreshes.
- Is read-only: it does not upload, replace, delete or approve verification evidence and does not change truck assignment.


## Driver document upload boundary

- Allows the signed-in Driver to upload or replace only their own identity and assigned-truck verification evidence.
- Accepts JPG, PNG, WebP or PDF up to 10 MB; Driver/truck photos remain image-only.
- Stores private objects under `<driver-id>/identity/...` or `<driver-id>/truck-<truck-id>/...` with `upsert: false`.
- Verifies both the current Supabase user and restored session before storage and database mutation.
- Re-checks vehicle ownership before vehicle-document submission.
- Resets every new or replacement submission to Pending for Admin/CEO review and clears stale rejection metadata.
- Uploads the new object before updating the database, removes it after a confirmed database failure, and reconciles ambiguous mutation outcomes before cleanup.
- Removes the superseded private object only after the database points to the new object.
- Locks overlapping submissions and never queues verification mutations offline.
- Does not approve documents, change Driver status, change truck assignment, alter RLS or expose a service-role key.
