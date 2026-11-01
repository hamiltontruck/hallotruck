# HALLO Customer SMS OTP — QA-only integration design

## Audit result (2026-11-01)

- `src/pages/CustomerLogin.tsx` signs up with **email + 6-digit password** and Ethiopian phone in metadata; login is email/password.
- `supabase/migrations/20260904234500_harden_public_signup_contact_validation.sql` creates `profiles` using an `auth.users` trigger that **requires an email** and metadata phone.
- A phone-first `auth.signInWithOtp({ phone })` could create a separate Auth identity and fail HALLO profile creation. **Do not use it as a drop-in Customer signup replacement.**
- This branch adds an **unwired** service for *already authenticated Customers* to confirm phone ownership using `updateUser({phone})` then `verifyOtp({phone, token, type:'phone_change'})`. No production app behavior is changed.
- The profile's original phone metadata is NOT automatically treated as verified. Confirmed identity is `auth.users.phone_confirmed_at` after Auth verification, subject to staging verification. Do not assert it from browser state alone.

## Desired account UX

1. Keep existing email/password signup and login unchanged.
2. After authenticated Customer session and customer-role check, offer **Verify phone number**.
3. Request OTP to normalized E.164 Ethiopian mobile (+2519... or +2517...); mask digits in UI.
4. Enter exactly six numeric digits; `verifyOtp` uses **phone_change**, not `sms` (which is for OTP sign-in).
5. Server-verified phone status gates only future, explicitly approved features; do not block existing booking until product/security review.
6. Resends use configured Supabase server-side rate limiting and UI cooldown; don't store OTP or sender credentials in frontend or logs.
7. On phone changes, re-verify; preserve HALLO profile identity and ensure `profiles.phone` synchronization only through an authorized, audited, staged operation.

## SMS provider / secrets

- Supabase Dashboard Auth > Providers > Phone must be configured for the isolated staging project with a delivery-capable SMS provider.
- Use a supported provider or signed Supabase **Send SMS Hook** for Ethiopian regional routes. Confirm +251 delivery to Ethio telecom and Safaricom Ethiopia, compliance and sender registration, actual SMS delivery fees, and retries **before** selecting a vendor.
- API tokens, webhook signing keys and sender secrets belong ONLY in Supabase secrets / provider configuration. Never in GitHub, Vite env or mobile builds.
- Enable CAPTCHA and tune OTP expiry, verification throttles, SMS per-hour limit, abuse monitoring and resend backoff **on the server**. Browser-only countdown is not a security control.

## QA acceptance gates

- Verify eligible existing Customer can receive SMS and confirm via `phone_change` on **staging**; invalid/expired/replayed code rejected.
- A Driver/Partner and anonymous user must not use the Customer-only feature; check that the OTP confirm endpoint never changes role.
- Duplicate phone/identity conflicts cannot create duplicate HALLO profiles; no customer can take over another account.
- Phone normalization handles 09, 07, +2519, +2517; account phone reconciliation and constraints checked in DB.
- Rate limits and CAPTCHA tested against repeated OTP sends; error responses do not leak account existence.
- Real SMS on both Ethiopian network types with an approved provider; delivery, delay, failed SIM and retry.
- Mobile EN / Afaan Oromoo / Amharic, 320/360/390/412 px, and Web QA.
- Unit, build, role/RLS and regression tests green. Separate explicit approval before Supabase Auth config, database migration, production UI, or deploy.

## Supabase references

- https://supabase.com/docs/guides/auth/phone-login
- https://supabase.com/docs/reference/javascript/auth-updateuser
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
- https://supabase.com/docs/guides/auth/rate-limits

**Status:** QA-only groundwork. Not wired to UI, no SMS sent, no staging/production Auth settings changed.
