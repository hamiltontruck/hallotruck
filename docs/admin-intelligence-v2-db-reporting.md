# Admin Intelligence V2 — database reporting

Admin Intelligence no longer loads the complete orders, customers, drivers, trucks, and payments histories into the browser.

## Production path

`AdminIntelligence.tsx` calls `getAdminIntelligenceV2()`, which invokes `public.admin_intelligence_v2()`.

The RPC provides:
- exact report KPIs for `today`, `7d`, `30d`, `90d`, and `all`
- Ethiopia-local day boundaries (`Africa/Addis_Ababa`)
- 7-day released-minus-refunded revenue trend
- status, route, and payment-provider breakdowns
- exact database coverage counts
- server-side global search across orders, customers, drivers, trucks, and payments
- bounded search pages (6 rows per category in the UI, max 50 accepted by the RPC)

## Security

The RPC is `SECURITY INVOKER`, calls `private.is_admin_or_ceo()`, revokes execution from `PUBLIC` and `anon`, and grants execution to authenticated callers subject to the leadership check.

## Data safety

Migration `20260912002822_admin_intelligence_v2_reporting` creates/replaces a read-only reporting RPC and supporting indexes. It does not update, delete, backfill, or rewrite production business rows.

## Compatibility

The legacy `admin-intelligence.service.ts` is no longer imported by the production page. It remains temporarily in the repository for isolated compatibility/audit work; the V2 regression guard prevents the production UI from returning to it.
