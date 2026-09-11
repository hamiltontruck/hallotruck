# Admin / CEO Control Center V2 DB reporting

The live CEO overview now uses a single leadership-only PostgreSQL report instead of loading large client-side source arrays.

## Previous scale risks

- up to 2,000 orders loaded on every overview refresh
- up to 4,000 payments loaded on every overview refresh
- up to 2,000 delivery proofs loaded on every overview refresh
- up to 4,000 driver verification files loaded on every overview refresh
- complete truck/customer/driver collections loaded client-side
- one `driver_financial_summary` RPC call per driver (N+1 network pattern)
- KPI values derived from capped arrays could eventually become partial or false

## V2 contract

`public.admin_control_center_v2_report()` returns:

- exact KPI and finance summary values calculated in PostgreSQL
- Ethiopia-local today boundaries (`Africa/Addis_Ababa`)
- bounded top-six previews for action queues
- canonical payment totals using the existing duplicate-key semantics
- set-based driver deposit / cash commission liability aggregation

The browser receives only the small queue previews required to render the CEO overview. Full records remain in their dedicated Admin workspaces.

## Authorization

- Admin / CEO only
- `SECURITY INVOKER`
- explicit `private.is_admin_or_ceo()` check
- `anon` and `public` execute revoked
- `authenticated` execute granted, with the in-function leadership check enforcing access

## Production

Migration `20260911144710_admin_control_center_v2_report` is applied in production. No order, payment, commission, deposit, proof, document, customer, driver, or truck rows are mutated by the reporting migration.
