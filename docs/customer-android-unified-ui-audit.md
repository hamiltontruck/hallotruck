# HALLO Customer Android unified UI audit

Audit target: `mobile/customer/android/`, compared with the current Customer Portal / Customer Mobile behavior and the approved Customer Android visual references.

## Current feature inventory

| Area | Current Android state | Backend/source | Gap before final unified app |
| --- | --- | --- | --- |
| Login / Register | Working auth, session restore, Customer DB-role check, EN/OR/AM switcher, hero art, forgot-password handoff | Supabase Auth + `profiles` | Visual polish and final safe-area consistency; Contact Support is not yet a dedicated auth action |
| Home | Live order count, unread notifications, recent orders, active order and quick links | `orders`, notifications, payment summaries | Runtime presentation adapter differs from the newly approved dashboard; KPI/hero/quick-action composition still needs final parity pass |
| Route / Map | Pickup/drop-off geocoding, HGV route, map line, ETA/distance | MapTiler + `quote-route` | Keep current functionality; final booking-step composition needs approved screen parity |
| Cargo / Truck | Structured cargo category, packaging, ton/quintal conversion, truck capacity guard | Existing Customer contract | Functional; visual card hierarchy and step transitions need final pass |
| Quote | Canonical quote calculation | `calculate_transport_quote_v2` | Working; stale-quote handling must stay authoritative |
| Review / Create | Review dialog exists | Previously direct `orders` insert | **Fixed in this branch:** commit through production `customer-booking` Edge Function with server-side route/quote/role validation and idempotency |
| Orders | Customer-owned orders, filters, details, cancellation, invoices | `orders`, payment RPCs | Functional; visual alignment only |
| Tracking | Live trip map, assignment card, driver/truck photos, call/message | tracking RPCs + signed media | Functional; visual alignment only; never fake GPS |
| Payments | Real payment/receipt state and invoice actions | payments + Customer payment contracts | Functional; visual alignment only |
| Profile | Live profile, avatar, edit and sign-out | Customer profile RPCs/storage | Functional; visual alignment only |
| Localization | English, Afaan Oromoo and Amharic resources exist | Android resources | Continue completeness audit for every new label/error state |
| Bottom navigation | Five bound buttons | `MainActivity` | Approved design requires a distinct central **Book** action plus Payments; current `navBook` is actually wired to Payments, so navigation structure needs a dedicated follow-up layout change |

## Architecture observations

The current app is Kotlin/XML, but `activity_main.xml` and `MainActivity.kt` are large multi-screen shells. `CustomerReferenceUi` and `CustomerApprovedScreens` perform presentation-only runtime transformations so existing business logic remains intact. This is useful for safe visual iteration, but it also means the final visual pass should avoid mixing static XML and runtime styling indefinitely.

For release safety, the implementation order is:

1. keep existing auth/session/role behavior intact;
2. move order creation to the production `customer-booking` authority;
3. normalize HALLO blue/navy/surface/card/input tokens;
4. finish approved Login/Home/Booking composition without changing business rules;
5. align Orders/Tracking/Payments/Profile to the same tokens;
6. fix the six-destination navigation structure;
7. run Android lint/unit/build plus 320/360/390/412dp and real-device smoke.

## Scope guard

Do not change Driver, Partner, Admin/CEO, Finance, pricing formulas, existing RLS, commission rules or production business data while finishing Customer Android UI parity.
