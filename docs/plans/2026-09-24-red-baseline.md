# RED baseline

These contract tests intentionally define behavior that is not yet implemented on this branch:

- truck capacity owns and locks Total Weight
- back/change truck re-synchronizes weight
- truck-card mobile spacing is explicit
- Orders expose live/full-live tracking with a prominent truck marker and honest offline/last-known state
- database prevents more than one assignment to the same driver on the same calendar day, including concurrent/manual/admin/auto paths and regardless of later delivered/cancelled state

Production implementation follows only after these RED contracts are present.
