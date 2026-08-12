# Supabase security review — 2026-08-12

This pass intentionally fixes only findings that can be hardened without breaking valid application RPC flows.

## Fixed in this branch

- `ratings` had RLS enabled with no policies. Added participant/leadership read access and customer-only insert access for the customer's own delivered order and assigned driver.
- Admin Driver Compliance now surfaces new/pending drivers even before their first document upload, while keeping 5/5 verified identity documents as the approval gate.

## Reviewed but not blindly revoked

Supabase flags many `SECURITY DEFINER` RPCs that are intentionally called by authenticated application users. Those functions already enforce role/ownership rules internally and are part of Admin, Customer or Driver workflows. Revoking `authenticated` from them would break the application and is not a valid blanket remediation.

## Platform-level follow-up

- Leaked password protection is currently disabled in Supabase Auth and should be enabled in Auth password/security settings when available for this project/plan.
- PostGIS owns `spatial_ref_sys` and installs objects in the public schema. Moving PostGIS or altering its system table should be handled as a dedicated database-extension migration, not mixed into an application UI/security patch.
