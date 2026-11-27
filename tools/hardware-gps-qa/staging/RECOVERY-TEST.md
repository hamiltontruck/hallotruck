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

## Phase 2 readiness after the denial attribution fix

The disposable TLS/SCRAM test uses a private PostgreSQL instance and a simulated
Supavisor FATAL payload. The runner binds a fresh failure to the same verified
QA host and IP, scoped startup user, database, port, CA and a per-attempt
application name. It brackets the attempt with independent reads of the marked
role's OID, NOLOGIN and null password. The PID/start-time termination proof is
still required. The revised classifier has not been run against hosted QA.

The writer and rehearsal share the same fixed-target libpq connector and denial
classifier. The writer checks the original managed role OID and marker, verifies
its authenticated backend PID and start time, commits revocation before ending
sessions, and checks the failed socket against the unique attempt. Both roles
are covered by disposable TLS/SCRAM and Supavisor diagnostic regression tests.
The real-writer CLI remains locked. Prepare and review the owner-controlled
activation entry point only with separate explicit authorization
for the following scope on Free project rmnjhdlbhfcmlvzqtblm only:

1. From the verified Termux runner confirm target/TLS, plan, restricted grants,
   disabled writer, null password, no writer sessions or recovery job, and empty QA tables.
2. Commit the server-side recovery schedule, ten-minute temporary writer
   credential and one synthetic device-to-truck mapping together. Keep an
   independent owner cleanup connection available; maximum recovery window is
   fifteen minutes.
3. Commit two synthetic positions, checking both original timestamps and
   mapping. Replay both; require zero additional rows and unchanged values.
   Roll back permission-denial and invalid-mapping probes.
4. On success or failure, commit NOLOGIN and PASSWORD NULL first, then close
   writer sessions. Independently verify zero sessions, rejected fresh login,
   no remaining recovery job, original grants, and disposal of temporary secrets.
   Report exact retained synthetic IDs and counts (success: one mapping, two
   positions); no deletes. Stop if any safety check is inconclusive.
