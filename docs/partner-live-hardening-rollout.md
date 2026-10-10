# Phase 1 Partner security closure

Production is read-only until explicit owner approval. PR #508 was merged before
production hardening; the merge did not establish runtime security verification.

## Read-only findings

The deployed Partner RPC calls `public.is_partner_member`, which does not exist.
The private helper exists. The base migration is recorded as `20261006022750`
(`partner_live_trip_read_access`), rather than the repository timestamp. Hardening
`20261008023352` is absent. The RPC body has base assignment checks only.

The Customer telemetry helper still enforces Customer/Driver/Admin access, so
calling it from an ordinary Partner RPC is not a valid positive path. This closure
changes only the Partner RPC; the Customer helper remains unchanged.

The inspected production log window (2026-10-09 22:30 to 2026-10-10 22:30 UTC)
returned no matching Partner RPC/helper messages. This does not prove successful
calls or explain the owner's device test. Its exact route, account authorization,
and timing remain unrecorded. Device testing remains owner-reported.

## Plan (not evidence)

1. Review `20261010224504_partner_live_membership_reference.sql`. It replaces only
   the helper reference in the deployed definition and preserves signature,
   columns, grants, SECURITY DEFINER, and search_path. Repeat pre-check afterward.
2. Review hardening `20261008023352` with positive-path migration `20261010224505`.
   Apply both in one transaction: remove their individual BEGIN/COMMIT and use one
   outer BEGIN/COMMIT with a five-second lock timeout. Never bulk-push unrelated
   pending migrations.
3. Review `partner-live-hardening-rollback.sql`, captured from production. It
   restores the prior broken helper reference and protection gap. Do not mark a
   rollback as successful hardening. Migration history reconciliation requires
   separate review; do not fabricate original timestamp entries.
4. Require CI and isolated test/preview PASS, then explicit production approval.
   Propose 02:00–02:30 Africa/Addis_Ababa; actual low traffic must be confirmed
   from current monitoring before scheduling or executing.
5. Before production smoke, confirm fixtures are TEST-named and no push can reach
   real users. After approval/application record positive LIVE, mismatch hidden
   with warning, tenant isolation, unconfirmed hidden, and direct tracking denied.

Production application and post-apply smoke remain pending approval. Production
TEST naming and notification isolation remain NOT RECORDED. Driver V4, Customer,
Smart Order and #509 are outside this change. Global available-job visibility for
Partner-employed drivers remains separate Gate B work.
