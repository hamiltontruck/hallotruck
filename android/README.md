# HALLO Logistics Android

Initial native Android driver application built with Kotlin, Jetpack Compose, Material 3 and the existing HALLO Supabase backend.

## Included
- Supabase Auth configuration through Gradle properties
- Driver email/password login
- Role-safe driver-only session gate
- Dashboard shell with Jobs, Active Trip, Wallet, Documents and Profile tabs
- Empty production-safe states; no sample operational data
- Unit tests and Android CI debug APK build

## Local configuration
Create or edit `~/.gradle/gradle.properties` and add:

```properties
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Do not commit real keys. The anon key is intended for client apps, but database access must remain protected by Supabase RLS.

## Android Studio
1. Open the `android` folder as the project.
2. Use JDK 17.
3. Sync Gradle.
4. Connect an Android device with USB debugging.
5. Run the `app` configuration.

## Command line

```bash
gradle -p android testDebugUnitTest
gradle -p android assembleDebug
```

The debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.
