# Customer–Driver trip completion workflow

## Scope

This workflow coordinates existing delivery, payment, commission and rating
features. It does not create a second financial ledger and does not rewrite
historical payment, commission, correction or rating rows.

## Driver flow

1. The assigned Driver starts the trip and submits proof of delivery (receiver,
   photo and signature).
2. A successful proof marks the order delivered and makes the truck available.
   Repeating the same request is idempotent and preserves the original proof.
3. For `pay_driver_on_delivery`, the Driver is sent directly to the payment
   collection screen. Cash needs an explicit full-invoice confirmation;
   bank/mobile payments need a transaction reference and evidence.
4. Admin/CEO verification releases the payment. Gross earnings and commission
   remain zero while verification is pending.
5. Released payments feed the existing duplicate-free 2% commission ledger.
   Refund corrections reduce the effective commission without deleting the
   source payment or charge.

Prepaid trips continue to use the existing verified-payment Driver confirmation
and automatic release-on-delivery path.

## Customer flow

The delivered order details show a completion tracker for delivery, payment and
rating. Customers can view only their own orders and can rate only the assigned
Driver on a delivered order.

## Security

- `trip_completion_summary(order_id)` is available to the order Customer,
  assigned Driver, and database-backed Admin/CEO roles only.
- Anonymous and `PUBLIC` execution are revoked.
- Cross-user access is rejected inside the `SECURITY DEFINER` function.
- Delivery proof, payment and rating leadership policies use
  `private.is_admin_or_ceo()` rather than mutable JWT metadata.
- Admin payment review uses the same database-backed role check.
- The summary is correction-aware and deduplicates the confirmation and direct
  collection commission ledgers by payment ID.

## Manual verification

1. Complete a Driver trip with POD and confirm pay-on-delivery redirects to
   `/driver/payment/:orderId`.
2. Submit cash or bank/mobile payment; verify it shows pending and all Driver
   earnings remain ETB 0.
3. Approve as Admin/CEO; verify released payment, one commission charge and the
   updated Driver completion tracker.
4. Open the Customer delivered order; verify payment completion and submit a
   1–5 rating.
5. Refresh both portals; confirm the completion state persists.
6. Confirm a different Customer/Driver and anonymous client cannot load the
   summary.
7. Repeat the POD RPC after success; confirm no second proof row is created.

Automated browser coverage checks the Customer and Driver tracker at 320px,
360px, 390px and 412px with no horizontal overflow.
