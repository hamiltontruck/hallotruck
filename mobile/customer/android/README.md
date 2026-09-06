# HALLO Customer Android

Independent native Customer client. It uses Kotlin, XML layouts, Material
Components, MVVM, Coroutines/StateFlow, ViewBinding, Supabase Kotlin and JDK 21.

Application ID and namespace: `com.hallo.logistics.customer`.

Configure the same existing HALLO backend used by all clients:

```properties
SUPABASE_URL=https://YOUR_EXISTING_HALLO_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_EXISTING_HALLO_PUBLISHABLE_OR_ANON_KEY
```

Never use a service-role/secret key. Add `hallocustomer://auth-callback` to the
existing Supabase Auth redirect allow-list for native email confirmation.

The Customer app provides signup/login and session restore, database Customer
role validation, Home, truck/quote/order creation, customer-owned orders,
allowed cancellation, active-trip tracking, payment/status visibility,
notifications and profile. Driver, Partner, Admin and CEO screens are absent.

With JDK 21:

```bash
gradle test assembleDebug lint
```
