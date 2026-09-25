# Customer order/truck + daily driver assignment

Implementation scope for this branch only:

- Tighten Customer Mobile truck-card spacing.
- Selecting a truck auto-fills Total Weight from truck capacity and locks manual editing.
- Going back and changing the truck re-synchronizes Total Weight.
- Bring Customer Orders cards to portal parity, including driver/truck details and tracking actions.
- Provide live tracking and full live tracking states with a prominent truck marker/arrow and honest offline/last-known state.
- Enforce one driver assignment per calendar day at the backend/database boundary. Same-day delivered/cancelled assignments still consume that day's assignment; manual/admin/auto/concurrent paths must not bypass the rule.
- Do not backfill or mutate existing production data.

Verification gates:

1. Tests are written first and observed RED.
2. Capacity lock and back/change synchronization pass.
3. Daily assignment concurrency/bypass tests pass.
4. Orders-card and tracking-state tests pass.
5. Build and CI pass.
6. Mobile smoke passes before merge.
