# HALO Customer Mobile App

Standalone Customer-only mobile application foundation for HALLO Logistics.

## Isolation

This app lives entirely under `apps/customer-mobile-app/` and does not import from or modify the root-web Customer Portal. It also does not share the Driver/Admin/Partner workspace UI.

## Current slice

- HALO blue/gold v4 mobile design
- full-map-first booking Home
- route inputs
- truck and cargo selection UI
- five Customer-only tabs: Home, Orders, Track, Payments, Profile
- truthful empty states for production data that is not connected yet
- no fabricated driver, ETA, payment or order data
- mobile-safe layout with safe-area support

## Deliberately not included yet

This foundation does not create orders, calculate production quotes, authenticate users, read payments or expose live tracking. Those integrations must reuse the existing production Customer authorization, RLS and pricing/order contracts in a later focused slice. No service-role key may ever be added to this client.

## Run

```bash
cd apps/customer-mobile-app
npm install
npm run dev
```

Validation:

```bash
npm run typecheck
npm run build
```

## Scope rule

Changes to this app should remain inside `apps/customer-mobile-app/` unless a separate reviewed integration explicitly requires shared infrastructure. Root Customer Portal UI and behavior must remain unchanged.
