# HALLO Driver V6

Standalone Vite export of the Floot HALLO Driver V6 app. It is isolated under `apps/driver-v6`; Driver V4 files and Vercel settings are outside this app.

- Vercel root directory: `apps/driver-v6`
- Build command: `npm run build`
- Output directory: `dist`
- V6-only environment variables: `HALLO_AUTH_API_URL` and `HALLO_AUTH_PUBLIC_KEY`
- Use the existing Supabase URL and publishable key only. Never add a service-role or secret key.

Protected API routes use Secure, HttpOnly, SameSite cookies and require an approved active driver profile.
