# HALLO Driver Android

Independent native Driver client (`com.hallo.logistics.driver`) built with
Kotlin, XML, Material Components, MVVM, StateFlow, ViewBinding and JDK 21.

It uses the same existing HALLO Supabase Auth, PostgreSQL, RLS, RPCs, Edge
Functions, Storage and Realtime contracts as every other HALLO client. Configure
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Gradle properties; never place a
service-role key in this app. Add `hallodriver://auth-callback` to the existing
Supabase Auth redirect allow-list.

Driver-only flows include 6-digit signup/login, session and database role/status
validation, onboarding, driver/vehicle documents, jobs and truck claiming,
active-trip GPS via the authenticated `tracking` function, delivery proof,
wallet, notifications and profile. Customer, Partner, Admin and CEO screens are
not included.

Production hardening adds explicit truck selection, a durable GPS retry queue,
exact cash-result validation and the complete 5 identity + 4 vehicle document
checklist. Server RPCs, RLS and Edge Functions remain authoritative.

```bash
gradle testDebugUnitTest lintDebug assembleDebug --no-daemon
```
