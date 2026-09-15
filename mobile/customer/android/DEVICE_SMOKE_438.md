# Customer Android device-smoke fixes (#438)

This branch is reserved for defects found after PR #437 merged and during physical-device validation of the native Customer Android app.

## Scope

- Native Customer Android only (`mobile/customer/android/`)
- Kotlin + XML only
- Preserve existing production Supabase schema, migrations, RLS, pricing, order/payment contracts, and production data
- No changes to Admin/CEO, Driver, Partner, or Finance

## Required smoke flow

Route → Cargo → Truck → Quote → Review → Success

Also validate:

- autocomplete and full map
- real distance/time
- authoritative ETB quote
- Cargo Category / Packaging Type / Weight Unit dropdowns
- truck selection
- payment method
- EN / Afaan Oromoo / Amharic switching
- review summary and order creation
- success screen
- 320 / 360 / 390 / 412dp responsiveness
- IME, safe-area, back navigation, crash/ANR/logcat

## Physical-device evidence — 2026-09-15

Observed from the supplied screenshots/video on the merged #437 APK:

- PASS — route pickup/drop-off selection is retained and rendered on the live map.
- PASS — Cargo Category, Unit and Packaging values can be selected (Food / Ton / Bagged observed).
- PASS — route calculation returned 414.9 km and 409 min.
- PASS — authoritative quote rendered as ETB 202,850 and stayed consistent through Review and Success.
- PASS — order creation completed with tracking ID `HT-2026-AA65EE`.
- PASS — later Home/Orders refresh showed 1 order and ETB 202,850 To Pay.
- PASS — order card later appeared with the same route, truck, distance and total.
- FAIL — outlined Route/Cargo/Review fields render hint/value geometry poorly on the physical device; dropdown labels overlap their selected values.
- FAIL — Quote `Review Booking` action wraps/clips at the bottom on the tested width.
- FAIL — Review action/dropdown presentation is too compressed at the tested width.
- FAIL — Success repeats the `Booking Confirmed!` title inside the page while the booking shell already shows it.
- NOT VALIDATED — Truck-step visual state was not captured in the supplied evidence.
- NOT VALIDATED — EN / Afaan Oromoo / Amharic recreation/persistence.
- NOT VALIDATED — 320 / 390 / 412dp widths.
- NOT VALIDATED — logcat crash/ANR/error review.

## Fixes applied in #438

- Use Material exposed-dropdown controls so TextInputLayout hint/notch geometry is correct on-device.
- Use Material autocomplete fields for Route pickup/drop-off.
- Enforce single-line compact booking navigation actions on narrow widths.
- Remove the duplicated Success-page title while preserving order/route/truck/total details.

## Rule

Record each observed item as PASS / FAIL / NOT VALIDATED. Fix only reproduced Customer Android defects and keep backend contracts unchanged.
