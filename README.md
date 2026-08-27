# Hallo Truck — Web API (Supabase Edge Functions)

Production operations documentation:

- [Fleet Management Enterprise](docs/fleet-management-enterprise.md)

## Endpoints

| Function | Method | Path | Purpose |
|---|---|---|---|
| quote | POST | /functions/v1/quote | distance + price via OpenRouteService HGV routing |
| orders | POST | /functions/v1/orders | create order, generates tracking ID (HT-YYYYMMDD-####) |
| orders | GET | /functions/v1/orders?id=HT-... | public tracking lookup |
| tracking | POST | /functions/v1/tracking | driver submits GPS ping |
| tracking | GET | /functions/v1/tracking?orderId=... | latest position for live map |
| driver-documents | POST | /functions/v1/driver-documents | register uploaded doc metadata |
| driver-documents | GET | /functions/v1/driver-documents | list own docs + verification status |
| admin-drivers | GET | /functions/v1/admin-drivers?status=pending | list drivers for review |
| admin-drivers | PATCH | /functions/v1/admin-drivers | approve/reject driver or document |
| payments | POST | /functions/v1/payments `{action:'initiate'}` | customer starts Telebirr/M-PESA checkout |
| payments | POST | /functions/v1/payments `{action:'webhook'}` | provider callback → holds funds in escrow |
| payments | POST | /functions/v1/payments `{action:'release_escrow'}` | admin releases funds after delivery |
| payments | POST | /functions/v1/payments `{action:'refund'}` | admin refunds a held payment |
| payments | GET | /functions/v1/payments?orderId=... | payment event history for one order |

## Setup

1. Run migrations in order in the Supabase SQL editor: `20260101_init.sql`, then `20260201_payments.sql`.
2. Set Edge Function secrets:
   ```
   supabase secrets set ORS_API_KEY=your_openrouteservice_key
   supabase secrets set TELEBIRR_APP_ID=your_telebirr_app_id
   supabase secrets set TELEBIRR_APP_KEY=your_telebirr_app_key
   supabase secrets set MPESA_CONSUMER_KEY=your_mpesa_key
   supabase secrets set MPESA_CONSUMER_SECRET=your_mpesa_secret
   supabase secrets set PAYMENT_WEBHOOK_SECRET=a_long_random_string
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase.
3. Register `PAYMENT_WEBHOOK_SECRET` as a static header (`x-webhook-secret`) with Telebirr/M-PESA when configuring their callback URL, so the `payments` webhook can verify it's really them.
4. Deploy each function (via GitHub Actions/CLI, or paste each `index.ts` through the Supabase Dashboard's Edge Function editor if deploying from a phone without the CLI).

## Escrow flow

`unpaid` → (webhook success) → `held_escrow` → (order marked `delivered` + admin calls `release_escrow`) → `released`
At any point while `held_escrow`, admin can call `refund` instead → `refunded`.

Every transition is logged in `payments` for audit/dispute resolution — nothing overwrites history, it only appends.

## Notes

- Auth: each function reads the `Authorization` header forwarded by the client and calls `supabase.auth.getUser()` — no separate JWT library needed.
- The Telebirr/M-PESA `checkout` responses in `initiate` are placeholder shapes (`redirectUrl` / `ussdCode`) — swap in the real Telebirr `createOrder` call and Daraja OAuth + STK Push once you have live merchant credentials.
- File uploads: client uploads directly to Supabase Storage first, then calls `driver-documents` POST with the resulting path — keeps large binaries off the Edge Function.
