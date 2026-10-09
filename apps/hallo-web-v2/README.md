# HALLO Web V2 — isolated foundation

**Scope:** New V2 application only. Existing V1 apps, root build, Supabase database and production deployments remain untouched.

## Run locally

```bash
cd apps/hallo-web-v2
npm install
npm run typecheck
npm run build
npm run dev
```

## Isolation rules

- Never import or modify V1 runtime files or use V1 production build configuration.
- No Supabase service-role keys in client code. No production database migrations in this phase.
- No fabricated quotes, routes, GPS locations, operational metrics or revenue.
- Authentication, RLS/RPC contracts, mapping and live data are future gated implementation tasks.
- V2 requires independent CI and a separate preview deployment before any release decision.
- No merge to main and no production deployment without separate approval.

This initial landing is a static **development foundation**, not a functional logistics app.
