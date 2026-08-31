# HALO Driver + Customer Mobile Workspace

This directory is an isolated Tailwind CSS v4 workspace for the HALLO Logistics Driver and Customer mobile experience.

## Scope

- Driver home, database-backed available jobs, active-trip summary, wallet, and profile shell.
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

Driver live-map controls, driver wallet records, Customer booking, Customer payments and live GPS remain separate integration slices. Those screens continue to use display data until their focused production integrations are completed.

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
