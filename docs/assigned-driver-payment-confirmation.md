# Assigned-driver payment confirmation

## Workflow

1. The database-assigned Driver finishes the trip.
2. The completed-trip payment page loads only through assignment-scoped RPCs.
3. For an existing customer payment, the Driver sees the amount, payment method, provider and transaction reference.
4. The Driver chooses either **Payment confirmed** or **Payment not received / not confirmed**. No Driver receipt or screenshot upload is required.
5. A positive confirmation creates an immutable audit event. The payment remains **Held Escrow**.
6. Finance displays **Assigned driver confirmed payment.** Admin/CEO may then run the separate escrow-release action.
7. A negative confirmation creates an immutable audit event with a reason, keeps escrow locked and does not create a commission row.

## Security invariants

- Assignment is read from `orders.driver_id`; client metadata is never trusted.
- The actor must be the assigned profile with the database `driver` role.
- Customer, Partner, another Driver, anonymous users, Admin and CEO cannot call Driver confirmation actions for the assigned Driver.
- Admin/CEO can read confirmation history through a database-role RLS policy and can release only through `admin_release_confirmed_driver_payment`.
- Confirmation events cannot be updated or deleted.
- Duplicate positive or negative events for the same payment are rejected.
- Delivery no longer auto-releases a confirmed payment.
- Held Escrow no longer counts as Released when `orders.payment_status` is recomputed.

## Migration

`supabase/migrations/20260828120000_assigned_driver_payment_confirmation_gate.sql`

The migration creates the immutable confirmation-event ledger, removes the delivery auto-release trigger, adds the explicit Admin/CEO release RPC, corrects canonical payment-status recomputation, and removes Driver-side receipt requirements for direct Bank/Telebirr collection reports.

## Validation

Run:

```bash
npm ci
npm run lint
npm run test:regression
npm run build
npm run test:e2e-smoke
```

The assigned-driver browser smoke covers 320, 360, 390 and 412 pixel widths and asserts that no file input is rendered.
