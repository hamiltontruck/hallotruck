# HALLO Customer Android unified UI audit

Audit target: `mobile/customer/android/`, compared with the current Customer Portal / Customer Mobile behavior and the approved Customer Android visual references.

## Current feature inventory

| Area | Current Android state | Backend/source | Gap before final unified app |
| --- | --- | --- | --- |
| Login / Register | Working auth, session restore, Customer DB-role check, EN/OR/AM switcher, hero art, forgot-password handoff | Supabase Auth + `profiles` | Final device-level safe-area/keyboard visual smoke; Contact Support remains intentionally absent until a verified destination exists |
| Home | Approved HALLO hero, quick actions, live KPI summary, recent orders, notification/language chrome | `orders`, notifications, payment summaries | Device visual smoke at 320/360/390/412dp |
| Route / Map | Pickup/drop-off geocoding, HGV route, map line, ETA/distance, approved route composition | MapTiler + `quote-route` | Device visual smoke and live-data error/empty-state review |
| Cargo / Truck | Structured cargo category, packaging, ton/quintal conversion, truck capacity guard, approved card hierarchy | Existing Customer contract | Device visual smoke only |
| Quote | Canonical quote calculation and approved quote presentation | `calculate_transport_quote_v2` | Verify stale-quote UX on device while preserving backend authority |
| Review / Create | Review flow commits through production `customer-booking` with stable request id/idempotency | `customer-booking` Edge Function + `customer_create_booking_v1` | Verify Review → Success transition on device |
| Success | Explicit booking-success state with real tracking id plus View order / Create another actions | Real created order state | Device visual smoke only |
| Orders | Customer-owned orders, filters, details, cancellation, invoices, unified HALLO visual tokens | `orders`, payment RPCs | Device visual smoke only |
| Tracking | Live trip map, assignment card, driver/truck photos, call/message, unified visual tokens | tracking RPCs + signed media | Device visual smoke; never fake GPS |
| Payments | Real payment/receipt state and invoice actions with unified visual tokens | payments + Customer payment contracts | Device visual smoke only |
| Profile | Live profile, avatar, edit and sign-out with unified visual tokens | Customer profile RPCs/storage | Device visual smoke only |
| Localization | English, Afaan Oromoo and Amharic resources for the new unified Customer UI | Android resources | Verify locale recreation on device |
| Bottom navigation | Six destinations implemented: Home → Orders → Book → Track → Payments → Profile | Existing page handlers + unified chrome | Verify active state/touch targets on device |

## Architecture observations

The app remains native Kotlin/XML. `CustomerReferenceUi`, `CustomerApprovedScreens`, `CustomerParityUiV2` and `CustomerUnifiedChrome` are presentation adapters over the existing business handlers so auth, booking, tracking, payment and profile contracts stay intact while the approved visual language is applied consistently.

The production Customer booking backend from PR #432 was merged to `main` on 2026-09-14. PR #433 is now retargeted to `main`, so release validation is against the same backend source that is already active in production.

For release safety, the remaining order is:

1. verify fresh PR #433 CI against `main`;
2. run Customer Android emulator/real-device visual smoke;
3. check 320/360/390/412dp widths, safe area and keyboard behavior;
4. verify Login → Home → Book → Orders → Track → Payments → Profile end to end;
5. verify EN / Afaan Oromoo / Amharic after locale recreation;
6. visually confirm Review/Success and loading/empty/error states before merge.

## Scope guard

Do not change Driver, Partner, Admin/CEO, Finance, pricing formulas, existing RLS, commission rules or production business data while finishing Customer Android UI parity.
