# HALLO Driver V6 (Floot snapshot)

This directory is a source snapshot of the separate Floot-based HALLO Driver V6 project. It is intentionally isolated from `apps/driver-mobile-app/` (Driver V4).

Scope guard:
- Driver V4 is read-only for V6 work.
- Reuse the existing HALLO Supabase backend; no V6-specific production schema.
- Frontend-safe Supabase URL/publishable key only; never service-role credentials.
- No fake GPS, truck position, route, jobs, wallet or trip data.
- Product languages: English, Afaan Oromoo, Amharic.
- Responsive target widths: 320 / 360 / 390 / 412 px.

The Floot runtime supplies its seeded design-system/runtime shell. This snapshot mirrors V6-owned application source plus the Button/Input primitives used by the login flow so GitHub review can remain bounded and V4 stays untouched.
