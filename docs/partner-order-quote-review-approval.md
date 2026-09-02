# Partner Order Quote / Review / Approval

This focused production slice extends the Partner self-service order foundation through quote approval without creating a canonical order.

## Lifecycle

1. Partner owner/admin submits a complete Partner order draft.
2. Active HALLO Admin/CEO starts review.
3. Active HALLO Admin/CEO issues a positive ETB quote with a future expiry.
4. Active Partner owner/admin accepts or rejects the quote.
5. Acceptance moves the Partner order to `approved` only.
6. Canonical `orders` placement and Partner dispatch integration remain a separate controlled slice.

## Authorization and integrity

- Admin mutations use database-backed `private.is_admin_or_ceo()` authorization.
- Partner quote responses require an active Partner profile, active owner/admin membership, and an active matching Partner organization.
- No `user_metadata`, `app_metadata`, URL role, or user-selected organization is trusted for authorization.
- Direct writes to `partner_orders` remain unavailable to authenticated clients; all mutations use guarded RPCs.
- Quote amount, expiry, actor, version, status history, and Partner activity events are retained.
- Expired quotes cannot be accepted.
- Rejection requires a reason.
- No canonical order, payment, finance, settlement, commission, or audit history is rewritten by this slice.

## Deployment safeguard

Migration `20260902051000_partner_order_quote_review_approval.sql` is committed but must not be applied to production automatically. After approval, apply it through the approved Supabase migration process, verify grants/RLS/role isolation and then advance the production migration marker in a separate focused PR.
