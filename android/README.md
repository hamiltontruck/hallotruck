# HALLO Native Android

Phase 2 converts the existing `android/` application from Compose to Kotlin + XML/ViewBinding and establishes MVVM/session/backend/tracking foundations.

Backend authority remains HALLO Supabase: Auth, PostgreSQL, RLS, RPCs, Edge Functions, Storage and Realtime. Android uses only public/anon configuration plus the authenticated user session. Never add service-role keys, OpenAI keys, privileged credentials, fake GPS, or client-side replacements for server business rules.

UI destinations in Phase 2 are navigation/shell foundations only. Feature implementation belongs to later phases.
