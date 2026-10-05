# HALLO Driver V6

Vercel-ready export of the separate Floot HALLO Driver V6 app.

- Vercel root directory: `apps/driver-v6`
- Build command: `npm run build`
- Output directory: `dist`
- V6-only environment variables: `HALLO_AUTH_API_URL` and `HALLO_AUTH_PUBLIC_KEY`
- Use the existing Supabase project URL and publishable key. Never add a service-role or secret key.

The API uses Secure, HttpOnly, SameSite cookies and requires an approved active driver for protected RPCs. Runtime auth stays unavailable until the V6 project has its own environment variables configured.
