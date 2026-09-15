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

## Rule

Record each observed item as PASS / FAIL / NOT VALIDATED. Fix only reproduced Customer Android defects and keep backend contracts unchanged.
