# Partner platform rollout review

This change is scoped to Partner-origin platform fees, the legacy Partner order road-distance flow, and a separately deployable complete Partner/Admin workspace. It is stacked on the Phase 1 Partner security closure branch.

## Behavior

- New earnings for canonical orders originating in `partner_orders` use a fixed 0.25% fee, calculated on effective released payments after refunds. ETB 100,000 yields HALLO ETB 250 and Partner ETB 99,750. Existing earnings and non-Partner-origin commission rules are unchanged.
- The existing Admin/CEO accrual wrapper, organization checks, settlement approvals and audit trail remain in place. The fee is enforced in the private database function, not an editable browser field.
- Legacy Partner order creation requires selected map coordinates and a successful authenticated HGV road route before saving. Editing either location clears the old distance and blocks save. Price review remains controlled by HALLO.
- Order details show stored road distance/time and link canonical orders to the organization's live fleet. Existing tenant isolation, assignment checks and freshness rules are reused.
- `npm run build:partner-platform` builds the existing Partner workspace, orders, dispatch, wallet and live operations pages plus Admin onboarding, order review, dispatch and finance gates. Its artifact is `dist-partner-platform`. Deploy it separately; it does not replace the complete application or its Customer/Driver entry.

## Verification evidence and limits

The new executable database test covers 0.25% calculation, unchanged legacy 2%, cross-organization denial, non-Admin denial, suspended organization denial, refunds, duplicate accrual, rounding, missing rules and no released payment. The production function was inspected read-only; the original authorization, payment and audit behavior matches the baseline preserved by this migration.

Local Chromium launch was blocked by sandbox socket permissions. GitHub Actions subsequently passed the real-form road-distance test, the Partner/Admin scoped build, lint, regression tests and both legacy/V2 builds on the CI fix commit. The road-distance test renders the real legacy form and save service with external routing/auth/RPC boundaries mocked; it verifies coordinate selection, automatic distance, stale-response rejection, failure/retry, save gating and the outgoing RPC payload. Authenticated production/device smoke remains a separate rollout gate.

The original CI failure was a V2 static responsive fixture dumped before its two animation-frame callbacks set readiness. The fixture now runs through Playwright and explicitly waits for readiness and font loading before checking layout. It still checks all four mobile widths and horizontal overflow; application V2 code is unchanged. The full browser suite must also pass on the final PR revision before merging.

Local builds used placeholder browser configuration, not a production deployment. No production migration, payment, account creation or GPS write was performed for this change.

## Required rollout gates

1. Review and merge the underlying Phase 1 closure changes and this scoped PR after browser verification and CI.
2. Review the existing `20261010005500_harden_partner_order_server_authority.sql` dependency separately. The production database currently lacks its route columns and updated draft RPC. Route metrics in this flow come from the existing road service, but the draft RPC receives client-supplied metrics; they are not a signed pricing authority. Do not enable the distance-save UI before the dependency is approved and deployed.
3. Obtain explicit approval before applying that dependency or `20261011150000_partner_platform_commission.sql` to production. Do not bundle unrelated Customer/Smart Order migrations into this rollout.
4. Build against the intended production Supabase project and public map configuration. Keep `VITE_PARTNER_SMART_ORDER_V2=false` for this reviewed legacy distance flow; the existing alternate Smart Order page is unchanged.
5. Deploy the Partner/Admin artifact to a separate deployment with the existing access protection. Use `/` for its base and `index.html` as the entry. Do not advertise a new live link until it exists and authenticated smoke testing passes.
6. Verify Admin-created Partner login, organization-scoped workspace/orders/fleet/wallet, active trip map, fresh/stale/offline GPS, and denied mismatched/unconfirmed assignments using owner-controlled TEST records only. Capture no account secrets in public evidence.
7. The full production app's unrelated migration parity gate remains unchanged. Its release requires a separate reviewed resolution; never advance the marker to hide missing migrations.

Before applying the fee migration, save the current private function definition and ACL as the rollback reference. Existing earned records are immutable snapshots and must not be rewritten during rollback. Roll back the UI deployment separately if needed.
