# HALLO Driver Mobile App

Independent TypeScript/React client for HALLO drivers. It has its own source root,
launcher, build output, authentication storage boundary, and deployment route. It
does not import or expose Customer, Partner, Admin, or CEO application screens.

## Backend boundary

This client connects to the same existing HALLO Supabase project used by every
HALLO client. It uses the public anon key, authenticated sessions, RLS, existing
RPCs, Edge Functions, Storage, and Realtime rules. Never add a service-role key
to this app or create a separate Supabase project for it.

Copy `.env.example` to `.env.local` and set both values to the existing HALLO
project:

```dotenv
VITE_SUPABASE_URL=https://YOUR_EXISTING_HALLO_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_EXISTING_HALLO_ANON_KEY
```

`VITE_SUPABASE_FUNCTIONS_URL` is optional; the app derives it from the project
URL when omitted.

## Driver workflow

- Driver login/signup with the existing exactly six-digit signup PIN contract
- Session restoration plus database-backed Driver role and `driver_status` checks
- Driver and vehicle onboarding, private document uploads, and verification state
- Available jobs, compatible truck selection, and authorized job acceptance
- Assigned/active trip, server-backed status transitions, GPS queue, and Realtime
- Delivery proof, payment-result reporting, and trip completion
- Wallet, deposit, commission, settlement/payment visibility
- Driver profile, vehicles, documents, and verification updates

The workflow reuses existing contracts including `get_available_jobs`,
`driver_available_trucks_for_order`, `claim_order_with_truck`,
`driver_save_vehicle_profile`, `driver_finish_trip`, and the existing financial
summary/payment contracts. No database schema or production data is changed here.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The production base route is `/hallotruck/driver-mobile/`.
