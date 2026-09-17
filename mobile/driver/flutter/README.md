# HALLO Driver Flutter

Parallel Flutter/Dart migration of the HALLO Driver Android app.

## Scope

This package is intentionally isolated under `mobile/driver/flutter/`. The existing native Kotlin/XML Driver app remains the fallback/reference until Flutter reaches verified feature parity.

Do not change Supabase schema, RLS/RPC contracts, pricing, finance rules, commission/deposit logic, dispatch rules, or production data to make this client pass.

## Foundation implemented

- Supabase Auth login/register with the existing driver role metadata.
- Driver PIN validation: exactly 6 numeric digits.
- Ethiopia phone validation: `09XXXXXXXX` or `+2519XXXXXXXX`.
- Persisted EN / OR / አማ language selection.
- Real driver profile from `profiles`.
- Available Jobs from existing `get_available_jobs` RPC.
- Active Trip from existing `orders` contract.
- Live Trip from existing `customer_get_live_trip` RPC.
- Flutter-native OpenStreetMap surface using authoritative pickup/dropoff/truck coordinates only.
- LIVE / STALE / OFFLINE freshness: <=2m / >2m to <=30m / >30m or missing.
- Bottom navigation: Home · Jobs · Trip · Wallet · Profile.
- Wallet is intentionally a placeholder until its authoritative parity slice is implemented. No fake financial values are shown.

## Bootstrap Android host

From PowerShell:

```powershell
cd C:\Users\HP\Desktop\hallo\hallotruck
git fetch origin driver-flutter-foundation
git checkout driver-flutter-foundation
git pull --ff-only origin driver-flutter-foundation

cd .\mobile\driver\flutter
.\tool\bootstrap_android.ps1
```

The bootstrap command generates only the Flutter Android host files, then runs `flutter pub get`, `flutter test`, and `flutter analyze`.

## Runtime configuration

Never commit Supabase values. Reuse the same public project URL and publishable key already approved for the Driver client by setting them locally:

```powershell
$env:SUPABASE_URL = '<existing-public-project-url>'
$env:SUPABASE_PUBLISHABLE_KEY = '<existing-public-publishable-key>'
.\tool\run_android.ps1
```

Do not paste private service-role keys into this app.

## Validation gate

Before calling the foundation PASS:

```powershell
flutter pub get
flutter test
flutter analyze
flutter build apk --debug `
  --dart-define="SUPABASE_URL=$env:SUPABASE_URL" `
  --dart-define="SUPABASE_PUBLISHABLE_KEY=$env:SUPABASE_PUBLISHABLE_KEY"
```

Then test on a real Android device or emulator:

- Register/Login and session restore.
- Invalid name/email/phone/PIN messages.
- EN / OR / አማ persistence after force-stop/reopen.
- Home real profile data.
- Jobs real authorized data and empty/error states.
- Active Trip real order data.
- Live map real coordinates only.
- LIVE / STALE / OFFLINE freshness and last update/speed/heading.
- Bottom navigation at 320 / 360 / 390 / 412dp widths.

## Next parity slices

After the foundation build/device gate is green: truck selection + claim flow, background GPS sharing, Wallet/History/Commission/Deposit, exact 8 Driver Documents, full Profile, Notifications, Delivery Proof, and lifecycle controls.
