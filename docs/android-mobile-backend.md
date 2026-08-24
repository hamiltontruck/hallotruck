# HalloTruck Android backend contract

This document is the implementation contract for the native Android app. The web app and Android app use the same Supabase project, users, orders, payments, files and tracking data.

## 1. Required one-time configuration

### Firebase Cloud Messaging

Create or select the HalloTruck Firebase project, add the Android application, and generate a **Firebase Admin service-account JSON**.

Store the complete JSON as a secret named:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

Add it in both places:

1. Supabase Edge Function secrets, so the live `push-notifications` function can send FCM HTTP v1 messages.
2. GitHub Actions repository secrets, so future Edge Function deployments preserve the Supabase secret.

Do not commit the service-account JSON, private key, `google-services.json`, service-role key or FCM token to Git.

`google-services.json` belongs only in the local Android application module and is not a replacement for the Admin service-account JSON.

### Supabase Auth redirect allowlist

In Supabase Dashboard open **Authentication → URL Configuration → Additional Redirect URLs** and add exactly:

```text
hallotruck://auth
```

This Dashboard setting cannot be represented safely in a database migration. Email verification and password recovery links cannot return to the Android app until this allowlist entry exists.

## 2. Android deep link

Configure the Supabase Kotlin Auth plugin with:

```kotlin
install(Auth) {
    scheme = "hallotruck"
    host = "auth"
}
```

Add the following intent filter to the activity that owns authentication:

```xml
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="hallotruck"
        android:host="auth" />
</intent-filter>
```

Forward the launch intent and every new intent to Supabase:

```kotlin
supabase.handleDeeplinks(intent)
```

Use `hallotruck://auth` as the redirect URL for:

- email verification after signup;
- password recovery email;
- future magic-link or OAuth flows.

After a password-recovery deep link creates a recovery session, show the reset-password screen and call Supabase Auth `updateUser` with the new password.

## 3. Android device registration

Create a random installation UUID once and store it in encrypted local preferences. Do not use IMEI, Android serial number, phone number or advertising ID.

After login and whenever Firebase rotates the token:

```text
register_android_device(androidDeviceId, fcmToken, appVersion)
```

When the app resumes or during a periodic heartbeat:

```text
touch_android_device(androidDeviceId, appVersion)
```

Before logout:

```text
unregister_android_device(androidDeviceId)
```

Language and notification permission:

```text
update_android_notification_preferences(androidDeviceId, locale, notificationsEnabled)
```

Supported locale values are `en`, `om`, `am`, `so`, and `ti`.

## 4. Push notifications

The database creates deduplicated notifications and an outbox record for:

| Event | Recipient | Recommended Android destination |
| --- | --- | --- |
| Order assigned | Driver | Jobs or active trip |
| Payment verified | Customer and assigned driver | Customer orders or driver earnings |
| Payment rejected | Customer, or driver for direct collection | Payment correction screen |
| Document expiry | Driver | Driver documents |
| Delivery completed | Customer and assigned driver | Tracking/order receipt or earnings |

The Android notification channel ID is:

```text
hallotruck_updates
```

The FCM data payload always includes:

```text
notification_id
 event_type
```

It can also include `order_id`, `payment_id`, `tracking_id`, `reason`, `document_type`, `expiry_date`, and `route`.

At app startup and after a push, load the authoritative in-app history using:

```text
my_notifications(limit)
```

Mark a notification as read with:

```text
mark_notification_read(notificationId)
```

Never trust only the push payload for financial or order state. Fetch the current protected record from Supabase before rendering an action.

## 5. GPS tracking API

Send authenticated POST requests to the `tracking` Edge Function with:

```json
{
  "orderId": "uuid",
  "lng": 38.7468,
  "lat": 9.0227,
  "heading": 90.0,
  "speedKmh": 25.0,
  "accuracyM": 8.0,
  "recordedAt": "2026-08-24T00:00:00Z",
  "androidDeviceId": "installation-uuid"
}
```

Rules enforced by the server:

- the authenticated user must be the assigned driver;
- the order must be `accepted` or `in_transit`;
- the optional Android installation must be actively registered to that driver;
- coordinates, heading, speed, accuracy and timestamp are validated;
- an accepted order becomes `in_transit` after the first valid ping;
- same-position pings within five seconds and ten metres are throttled;
- direct client inserts into `tracking_pings` are disabled;
- `tracking_pings` is published through Supabase Realtime;
- pings older than 30 days are removed by a daily retention job.

The response distinguishes stored and throttled updates:

```json
{
  "ok": true,
  "pingId": 123,
  "inserted": false,
  "throttled": true,
  "recordedAt": "2026-08-24T00:00:00Z"
}
```

Use a foreground location service during an active trip. Store failed pings locally and replay them with the original `recordedAt`. Stop the service immediately when the order is delivered, cancelled, reassigned or the driver logs out.

## 6. Server operations

The backend runs these jobs:

- push outbox dispatch every two minutes, in addition to immediate best-effort dispatch;
- stale push lease recovery every five minutes;
- document-expiry scan daily;
- GPS retention cleanup daily.

Invalid FCM tokens are cleared automatically. Failed transient deliveries use exponential retry with a maximum of eight attempts.
