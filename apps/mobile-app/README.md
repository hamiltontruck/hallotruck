# HALO Driver + Customer Mobile Workspace

This directory is an isolated Tailwind CSS v4 workspace for the HALLO Logistics Driver and Customer mobile experience.

## Scope

- Driver home, available jobs, live trip map, wallet, and profile shell.
- Customer home, shipment booking, live order map, payments, and profile shell.
- HALO blue-and-gold mobile design tokens.
- Full-height mobile map experience with safe-area-aware navigation.
- Afaan Oromoo-first sample interface.

## Isolation guarantee

The existing production web application remains in the repository root and continues to use Tailwind CSS v3.4. This mobile workspace has its own `package.json`, Vite configuration, Tailwind v4 dependency, CSS entry point, and build output. It does not import or modify the Admin, CEO, Finance, Partner, Operations, Supabase, RLS, payment, or order-workflow code.

## Run locally

```bash
cd apps/mobile-app
npm install
npm run typecheck
npm run build
npm run dev
```

## Current implementation status

This first slice establishes the isolated build and the production-quality responsive UI shell. It intentionally uses display data only. Connecting the screens to the existing authentication, services, Supabase queries, order state machine, payment records, and live GPS must be completed in a separate focused integration slice with role-isolation and regression tests.

## Design constraints

- Minimum supported viewport: 320 px.
- Bottom navigation includes `env(safe-area-inset-bottom)` support.
- Touch targets are at least approximately 40–44 px.
- Focus-visible states and reduced-motion preferences are supported.
- No style from this package is loaded by the existing root application.
