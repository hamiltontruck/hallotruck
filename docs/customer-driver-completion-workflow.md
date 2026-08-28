# Customer–Driver trip completion workflow

## Scope

This workflow coordinates the existing delivery, payment, commission and rating features. It does not create a second payment ledger, rewrite historical payment rows, or accrue Driver commission before a payment is released.

## Driver flow

1. The database-assigned Driver starts the trip and submits proof of delivery.
2. Successful proof marks the order delivered and makes the truck available. Repeating the same proof request remains idempotent.
3. The Driver is routed to `/driver/payment/:orderId` after finishing the trip.
4. For an existing customer Bank/Telebirr payment, the page shows the amount, provider and transaction reference. The Driver does not upload a receipt or screenshot.
5. The Driver chooses **Payment confirmed** or **Payment not received / not confirmed**.
6. A positive confirmation creates an immutable assigned-driver event but keeps the payment in Held Escrow. Admin/CEO then performs the separate release action.
7. A negative confirmation records the reason, keeps escrow locked and creates no commission.
8. For cash or Bank/Telebirr paid directly to the Driver, the same page records the payment without a Driver receipt upload. Admin/CEO review remains required, and Bank/Telebirr remains in escrow until the assigned-driver confirmation gate is satisfied.
9. Released payments feed the existing duplicate-free commission ledger. Refund corrections reduce effective commission without deleting source rows.

## Customer flow

The delivered-order view shows delivery, payment and rating progress. Customers can view only their own orders and can rate only the assigned Driver on a delivered order.

## Finance flow

- Before Driver confirmation: **Assigned driver confirmation is required before releasing this payment.**
- After positive Driver confirmation: **Assigned driver confirmed payment.**
- Admin/CEO may release only a delivered Held Escrow payment with an immutable positive event from the current database-assigned Driver.
- A payment-not-received event displays its reason and leaves the release action disabled.

## Security

- Assignment is checked from `orders.driver_id`; mutable metadata is never used for authorization.
- Only the assigned database Driver role can submit either confirmation action.
- Another Driver, Customer, Partner, anonymous user, Admin or CEO cannot impersonate the assigned Driver.
- Admin/CEO can read immutable confirmation history through database-role RLS and can release through a separate leadership RPC.
- Confirmation events reject update and delete operations.
- Duplicate positive or negative confirmation events are rejected.
- Delivery no longer auto-releases escrow.
- Held Escrow is not counted as Released when the order payment status is recomputed.

## Manual verification

1. Complete a Driver trip with proof of delivery and confirm navigation to `/driver/payment/:orderId`.
2. Open a delivered Held Escrow Bank/Telebirr payment as the assigned Driver; verify amount, provider and transaction reference are visible and no file input exists.
3. Confirm the payment; verify Finance changes to **Assigned driver confirmed payment.** while the payment remains Held Escrow.
4. Verify another Driver and non-Driver roles are denied.
5. Verify a duplicate confirmation is denied.
6. Verify Admin/CEO release is denied before confirmation and succeeds after confirmation.
7. Verify **Payment not received / not confirmed** records the reason, keeps escrow locked and creates no commission.
8. Verify Customer and Driver completion trackers remain mobile-safe at 320, 360, 390 and 412 pixels.
