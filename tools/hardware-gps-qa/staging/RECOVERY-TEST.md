# HALLO GPS QA recovery rehearsal

Use the owner-controlled Termux device and the pinned QA Session Pooler only.
The production writer activation entry point stays locked. The rehearsal targets
only `hallo_gps_qa_recovery_test` and `hallo-gps-qa-recovery-test`. It verifies
the temporary role's effective GPS privileges before committing its login.

## Before the hosted run

Confirm the QA project ref `rmnjhdlbhfcmlvzqtblm`, its Free plan, completion
of the disposable crash/timeout/rollback test, and an independently accessible
owner session for emergency cleanup. The runner checks the pinned Supabase CA,
the QA schema, pg_cron 1.6.4, the real writer's disabled state, empty telemetry
tables, and absence of cron jobs before creating any test objects. Run only one
rehearsal at a time.

Use Termux's PostgreSQL client libraries and Python 3 with Psycopg 3 installed.
The tested Psycopg version is 3.3.9. In an interactive terminal, from this
directory, run:

```sh
( exec -c "$PREFIX/bin/python" -IB hosted-recovery-test.py )
```

Enter the existing QA postgres password at the hidden prompt. The program keeps
the random rehearsal password in process memory. It commits a ten-minute lease
and a one-minute recovery schedule together, opens one pooler session, verifies
it exists on the server, and disconnects the activating client. Keep the phone
awake until cleanup finishes. Report only the status lines.

Each cron invocation commits one stage: revoke login and password; terminate
only matching test-role sessions; then, on a later invocation, verify the role
state and zero sessions before unscheduling. The observer checks the original
session, explicitly tests fresh authentication before dropping the role, and
compares the final state with the baseline. A timeout or transport failure on
fresh login is inconclusive.

## Interrupted run

Use the independent QA owner connection if the process disappears or reports
unverified cleanup. Verify the exact QA project, role comment beginning with
`HALLO GPS recovery test `, and the matching job name, owner and SQL. If ownership
is ambiguous, stop. Commit `ALTER ROLE hallo_gps_qa_recovery_test NOLOGIN PASSWORD NULL`
first. In a new transaction terminate only backends where
`usename = 'hallo_gps_qa_recovery_test'`, using bounded waits. In another
transaction verify NOLOGIN, null password, and zero sessions; unschedule only
the identified rehearsal job if present and drop only the identified test role.
Never drop dependencies or delete run history. Verify zero jobs and test roles,
zero real-writer sessions, and the original GPS row counts. Report the run
incomplete if the old credential's explicit authentication rejection could not
be observed.
