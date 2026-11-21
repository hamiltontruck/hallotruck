"""Owner-run Termux recovery rehearsal. Separate test role, no telemetry writes."""
import ctypes.util
import getpass
import ipaddress
import os
from pathlib import Path
import re
import runpy
import secrets
import sys
import time
import warnings

runner = runpy.run_path(str(Path(__file__).resolve().with_name("owner-phase2.py")))
ROLE, JOB = runner["TEST_ROLE"], runner["TEST_JOB"]
WRITER = runner["ROLE"]
require, scalar = runner["require"], runner["scalar"]
state_sql = """SELECT NOT rolcanlogin, rolpassword IS NULL,
    (SELECT count(*) FROM pg_stat_activity WHERE usename=a.rolname)
    FROM pg_authid a WHERE rolname=%s"""


def state(owner, role):
    return owner.execute(state_sql, (role,)).fetchone()


def job_count(owner):
    return scalar(owner, "SELECT count(*) FROM cron.job")


def open_session(role, password, *, address=None, app="hallo-gps-recovery-rehearsal"):
    import psycopg
    return psycopg.connect(host=runner["HOST"], port=5432, dbname="postgres", hostaddr=address,
                           user=role+"."+runner["REF"], password=password,
                           sslmode="verify-full", sslrootcert=str(runner["CA"]),
                           require_auth="scram-sha-256", sslcertmode="disable",
                           gssencmode="disable", passfile="/dev/null", connect_timeout=8,
                           tcp_user_timeout=5000, keepalives_idle=5, keepalives_interval=2, keepalives_count=2,
                           application_name=app, autocommit=True)


def ensure_owner(c):
    require(c.execute("""SELECT current_user,session_user,current_database(),
        obj_description('hallo_gps_qa'::regnamespace,'pg_namespace')""").fetchone()
        == ("postgres", "postgres", "postgres", "HALLO GPS QA schema v1"), "QA identity")
    c.execute("SET statement_timeout='8s'")
    c.execute("SET lock_timeout='2s'")


def attributed_rejection(exc, address, attempt):
    # Attribute the response on the failed startup socket itself. Generic
    # Supavisor FATALs do not name a role. Never classify pasted/logged text.
    conn = exc.pgconn
    if conn is None:
        return False
    user = f"{ROLE}.{runner['REF']}".encode()
    if (conn.user, conn.host, conn.hostaddr, conn.port, conn.db) != (
            user, runner["HOST"].encode(), address.encode(), b"5432", b"postgres"):
        return False
    opts = {item.keyword: item.val for item in conn.info}
    if (opts.get(b"application_name"), opts.get(b"sslmode"), opts.get(b"sslrootcert")) != (
            attempt.encode(), b"verify-full", str(runner["CA"]).encode()):
        return False
    # PQerrorMessage can include a connection prefix. Reject combined failures,
    # DETAIL/HINT text, and different EAUTHQUERY causes (including timeouts).
    line = conn.error_message.rstrip(b"\n")
    if b"\n" in line or b"\r" in line:
        return False
    prefix, fatal, reason = line.partition(b"FATAL:")
    if not fatal or (prefix and not re.fullmatch(rb"connection to server at [^\r\n]+ failed: ", prefix)):
        return False
    role = ROLE.encode()
    return reason.strip() in {
        b"(EAUTHQUERY) user not found in the database",
        b'password authentication failed for user "' + role + b'"',
        b'role "' + role + b'" is not permitted to log in',
        b'password authentication failed for user "' + user + b'"',
        b'role "' + user + b'" is not permitted to log in',
    }


def fresh_denial(observer, password, address, marker):
    from psycopg import OperationalError
    # Independent autocommit reads bracket this one TLS-verified reconnect.
    # The original login succeeded with the same credentials and peer address.
    from psycopg.pq import TransactionStatus
    require(observer.autocommit and observer.info.transaction_status == TransactionStatus.IDLE,
            "independent revocation observation required")
    def revoked_oid():
        return scalar(observer, """SELECT (SELECT oid FROM pg_authid
            WHERE rolname=%s AND NOT rolcanlogin AND rolpassword IS NULL
            AND shobj_description(oid,'pg_authid')=%s)""", (ROLE, marker))

    oid = revoked_oid()
    require(oid is not None, "committed revocation missing")
    attempt = "hallo-gps-denial-" + secrets.token_hex(12)
    try:
        with open_session(ROLE, password, address=address, app=attempt):
            pass
    except OperationalError as exc:
        require(attributed_rejection(exc, address, attempt), "fresh authentication rejection inconclusive")
        require(revoked_oid() == oid, "revoked role changed during fresh login")
        return
    raise RuntimeError("revoked pooler credential accepted")


def verify_no_grants(owner):
    require(not scalar(owner, """SELECT has_schema_privilege(%s,'hallo_gps_qa','USAGE,CREATE')
        OR EXISTS (SELECT FROM pg_class c WHERE c.relnamespace='hallo_gps_qa'::regnamespace
        AND c.relkind IN ('r','p') AND (has_any_column_privilege(%s,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege(%s,c.oid,'DELETE,TRUNCATE,TRIGGER')))""", (ROLE, ROLE, ROLE)),
        "test role has GPS access")


def cleanup(owner, marker):
    from psycopg import sql
    with owner.transaction():
        record = owner.execute("""SELECT shobj_description(oid,'pg_authid')
                            FROM pg_roles WHERE rolname=%s""", (ROLE,)).fetchone()
        if record is None:
            require(job_count(owner) == 0, "unexpected remaining job")
            return
        require(record == (marker,), "test role marker mismatch")
        owner.execute(sql.SQL("ALTER ROLE {} NOLOGIN PASSWORD NULL").format(sql.Identifier(ROLE)))
    with owner.transaction():
        owner.execute("SELECT pg_terminate_backend(pid,2000) FROM pg_stat_activity WHERE usename=%s",
                      (ROLE,))
    with owner.transaction():
        require(state(owner, ROLE) == (True, True, 0), "cleanup role or sessions")
        rows = owner.execute("SELECT jobid,command,username FROM cron.job WHERE jobname=%s",
                             (JOB,)).fetchall()
        for job_id, command, user in rows:
            require(command == runner["recovery_sql"](ROLE, JOB) and user == "postgres",
                    "cleanup job mismatch")
            require(scalar(owner, "SELECT cron.unschedule(%s::bigint)", (job_id,)), "unschedule")
        owner.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(ROLE)))


def heartbeat(writer):
    # Keep this connection alive and detect any pooler backend replacement.
    return scalar(writer, """SELECT pid::text || '/' || extract(epoch FROM backend_start)::text
                  FROM pg_stat_activity WHERE pid=pg_backend_pid() AND usename=current_user""")


def prove_termination(observer, writer, job_id, identity, deadline):
    from psycopg import OperationalError
    alive_after_revoke = False
    while time.monotonic() < deadline:
        revoked = state(observer, ROLE) == (True, True, 1)
        try:
            require(heartbeat(writer) == identity, "pooler backend changed")
        except OperationalError as exc:
            require(alive_after_revoke and exc.sqlstate == "57P01",
                    "early disconnect or unconfirmed server termination")
            break
        alive_after_revoke |= revoked
        time.sleep(2)
    else:
        raise RuntimeError("heartbeat deadline exceeded")

    notifications = observer.notifies(timeout=5, stop_after=1)
    try:
        event = next(notifications, None)
    finally:
        notifications.close()  # Release the Psycopg connection lock before querying history.
    if event is not None:
        require(event.channel == "hallo_gps_recovery_evidence" and event.payload == identity,
                "termination PID or start time mismatch")
        while time.monotonic() < deadline:
            if scalar(observer, """SELECT EXISTS (SELECT FROM cron.job_run_details
                      WHERE jobid=%s AND job_pid=%s AND username='postgres' AND status='succeeded'
                      AND start_time >= to_timestamp(%s::numeric))""",
                      (job_id, event.pid, identity.split("/")[1])):
                return
            time.sleep(0.5)
    raise RuntimeError("missing confirmed recovery job termination evidence")


def rehearse(observer, owner, password):
    from psycopg import OperationalError, sql
    marker = "HALLO GPS recovery test " + secrets.token_hex(12)
    watchdog = runner["recovery_sql"](ROLE, JOB)
    def check_baseline():
        return state(observer, WRITER), runner["counts"](observer), job_count(observer)

    require(check_baseline() == ((True, True, 0), (0, 0), 0), "baseline state")
    require(scalar(observer, "SELECT to_regrole(%s) IS NULL", (ROLE,)), "test role exists")
    require(scalar(observer, "SELECT extversion FROM pg_extension WHERE extname='pg_cron'") == "1.6.4",
            "scheduler version")
    writer = None
    started = time.monotonic()
    try:
        with owner.transaction():
            owner.execute(sql.SQL("CREATE ROLE {} NOLOGIN CONNECTION LIMIT 1").format(sql.Identifier(ROLE)))
            owner.execute(sql.SQL("COMMENT ON ROLE {} IS {}").format(sql.Identifier(ROLE),
                                                                     sql.Literal(marker)))
            verify_no_grants(owner)
            job_id = scalar(owner, "SELECT cron.schedule(%s,'* * * * *',%s)", (JOB, watchdog))
            expiry = scalar(owner, "SELECT clock_timestamp()+interval '10 minutes'")
            verifier = owner.pgconn.encrypt_password(password.encode(), ROLE.encode(), b"scram-sha-256")
            owner.execute(sql.SQL("ALTER ROLE {} LOGIN PASSWORD {} VALID UNTIL {}").format(
                sql.Identifier(ROLE), sql.Literal(verifier.decode()), sql.Literal(expiry.isoformat())))
        observer.execute("LISTEN hallo_gps_recovery_evidence")
        writer = open_session(ROLE, password)
        require(scalar(writer, "SELECT current_user") == ROLE, "test session identity")
        require(state(observer, ROLE) == (False, False, 1), "test backend visibility")
        address = str(ipaddress.ip_address(writer.info.hostaddr))
        identity = heartbeat(writer)
        require(identity is not None, "original backend identity missing")
        owner.close()  # Disconnect activation client, leaving independent backend and observer.
        prove_termination(observer, writer, job_id, identity, started + 895)
        while time.monotonic() - started < 895:
            if state(observer, ROLE) == (True, True, 0) and job_count(observer) == 0:
                break
            time.sleep(2)
        require(state(observer, ROLE) == (True, True, 0) and job_count(observer) == 0,
                "recovery deadline missed")
        elapsed = time.monotonic() - started
        require(elapsed < 900, "recovery exceeded 15 minutes")
        runs = scalar(observer, """SELECT count(*) FROM cron.job_run_details
                      WHERE jobid=%s AND username='postgres' AND status='succeeded'""", (job_id,))
        require(runs >= 3, "scheduler history incomplete")
        fresh_denial(observer, password, address, marker)
        print(f"PASS recovery {elapsed:.1f}s, cron terminated backend {identity}, NOLOGIN, password NULL, sessions 0, jobs 0, fresh login denied")
    finally:
        if writer is not None:
            writer.close()
        cleanup(observer, marker)
        require(state(observer, ROLE) is None and check_baseline() == ((True, True, 0), (0, 0), 0),
                "final baseline mismatch")
        print("PASS cleanup: test role absent, jobs 0, writer locked, sessions 0, GPS counts 0/0")


def load_termux_pq():
    # Psycopg's pure Python wrapper asks ctypes for "pq". Android's library
    # search can miss the private Termux prefix even when dlopen succeeds.
    lib = Path("/data/data/com.termux/files/usr/lib/libpq.so")
    require(lib.is_file(), "Termux libpq.so missing")
    original = ctypes.util.find_library

    def locate(name):
        if name == "pq":
            return str(lib)
        if name == "c":
            return "libc.so"  # Android's Bionic libc.
        return original(name)

    try:
        ctypes.util.find_library = locate
        from psycopg import pq
        require(pq.version() >= 160000, "libpq 16 or newer required")
        return pq.version()
    finally:
        ctypes.util.find_library = original


def main():
    runner["guard"]()
    require(sys.flags.isolated and sys.stdin.isatty() and not any(
        k.startswith(("LD_", "DYLD_")) or k in {"DATABASE_URL","SUPABASE_DB_URL"} for k in os.environ
    ), "isolated interactive Termux required")
    require(sys.argv[1:] in ([], ["--check-client"]), "unexpected arguments")
    try:
        version = load_termux_pq()
    except (ImportError, OSError):
        raise RuntimeError("Termux requires Psycopg 3 and libpq") from None
    if sys.argv[1:]:
        print(f"PASS | Psycopg client | libpq {version}")
        return
    warnings.simplefilter("error", getpass.GetPassWarning)
    password = getpass.getpass("QA owner database password: ")
    with open_session("postgres", password) as observer, open_session("postgres", password) as owner:
        del password
        ensure_owner(owner)
        ensure_owner(observer)
        require(scalar(observer, "SELECT pg_try_advisory_lock(hashtextextended(%s,0))", (JOB,)),
                "concurrent rehearsal")
        rehearse(observer, owner, secrets.token_urlsafe(48))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        sys.exit("FAIL | " + str(exc))
    except (Exception, KeyboardInterrupt):
        sys.exit("FAIL | verify QA cleanup independently")
