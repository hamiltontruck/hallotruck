# Partner Order Input Reduction Implementation Plan

**Goal:** Reduce actual typing and prevent pickup/destination autofill corruption.
**Spec:** docs/superpowers/specs/2026-10-25-partner-order-input-reduction-design.md
**Architecture:** Structured metadata travels with each selected provider result; form payload uses it directly. Existing React step state, authoritative HGV route and draft RPC remain in place.

- [x] Reproduce lost provider context and suppressed precise results in scripts/partner-geocoding-service-test.mjs; test independent routing, no repeated metadata input, fewer mandatory cargo fields, explicit contact reuse and accurate payload in real browser form test.
- [x] Implement structured geocoding and independent endpoint UI in partner-smart-order-routing.service.ts and PartnerRoadDistance.tsx; do not alter shared Customer geocoding behavior.
- [x] Replace repeated metadata and reduce required cargo typing in PartnerOrderNew.tsx; preserve optional overrides, separate contacts, review and explicit save gating.
- [ ] Run browser tests at 320/390/768px, lint, full regression and builds; fix failures, publish PR, pass protected CI, merge and verify served production release with isolated requests.

Review focus: missing metadata, same-label provider results with richer context, exact city suppressing neighborhoods, stale response on endpoint change, route failures, empty optional contacts versus explicit reuse, switching reuse off restores independent input, Back/Next retention, no early mutation, invalid capacity/weight and mobile field bounds.
