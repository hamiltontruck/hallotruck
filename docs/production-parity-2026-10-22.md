# Production migration parity — 22 October 2026

Production project: `febgayjolfrooaqenlje`. Netlify preview project `rtrdjtceytldcmdvzukp` is separate and was not modified or copied.

The prior confirmed source baseline was `20261002090000`. MCP migration timestamps differ from source filenames; the following records map the complete subsequent source sequence to applied production changes:

| Source version | Production record |
| --- | --- |
| 20261006020000 | 20261006022750 partner_live_trip_read_access |
| 20261007034500 | 20261022220312 real_customer_driver_chat_notifications_preserve_deposits |
| 20261008023352 | 20261011023226 phase1_partner_security_closure_reviewed_bundle |
| 20261010005500 | 20261011181846 harden_partner_order_server_authority |
| 20261010224504 | 20261011023226 phase1_partner_security_closure_reviewed_bundle |
| 20261010224505 | 20261011023226 phase1_partner_security_closure_reviewed_bundle |
| 20261011150000 | 20261011181857 partner_platform_commission |
| 20261011213221 | 20261011220452 partner_driver_registration |
| 20261012014441 | 20261012015156 partner_driver_workspace_separation |
| 20261012021030 | 20261012021229 rebind_driver_visibility_policies |
| 20261012023009 | 20261012023447 partner_driver_review_reopen |

History and deployed function definitions were inspected before advancing the marker. The reviewed security bundle contains the tenant/assignment hardening, private membership reference and positive telemetry path. Production exposes the scoped live-trip, driver registration/roster, own vehicle/trip, review/reopen and commission functions. Earlier ownership/ACL verification is recorded in the Partner Driver workspace release evidence.

The only missing migration was Customer/Driver chat notification delivery. Its original source narrowed the notification allowlist and would reject four existing deposit notifications. Before applying it, both the constraint and enqueue function were corrected to retain `driver_deposit_added` and `driver_deposit_reversed`. A local PGlite regression failed against the original migration and passed with the fix: existing deposits, both deposit event enqueue paths, peer-only chat routing, dedupe, push outbox and private execution ACLs.

Applied the corrected SQL through the migration API. Post-apply introspection verified one enabled chat notification trigger, the eight-event constraint, SECURITY DEFINER functions with empty search_path, and denied anon/authenticated direct execution. Existing notification counts remained unchanged: order_assigned 31, document_expiry 7, payment_verified 14, delivery_completed 55, driver_deposit_added 4. No production chat, push, account or test fixture was inserted. Pre-change definitions were saved in the local rollout evidence directory for recovery.

The marker confirms the latest **source** migration version, not the latest MCP timestamp. No history was fabricated or renamed and no parity check was bypassed. GitHub Pages must still pass its normal tests and deployment gate. Authenticated device verification of Drivers and live GPS remains a separate release check; static assets alone cannot prove it.
