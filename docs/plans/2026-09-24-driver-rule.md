# Daily driver assignment invariant

A driver may receive at most one assignment for a calendar day. Completing or cancelling that assignment later on the same day does not restore eligibility. The backend/database boundary must enforce this invariant so UI, admin/manual, auto-assignment, and concurrent requests cannot bypass it.
