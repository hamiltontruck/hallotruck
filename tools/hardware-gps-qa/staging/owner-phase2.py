"""Termux Phase 2 candidate. The activation gate stays closed pending recovery testing."""
import hashlib
import ipaddress
import re
import os
import secrets
import sys
from pathlib import Path

REF = "rmnjhdlbhfcmlvzqtblm"
HOST = "aws-1-eu-central-1.pooler.supabase.com"
ROLE = "hallo_gps_qa_ingest"
CA = Path(__file__).resolve().with_name("supabase-root-2021.crt")
CA_HASH = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
JOB = "hallo-gps-qa-phase2-revoke"
DEVICE = "qa-phase2-device-001"
TRUCK = "qa-phase2-truck-001"


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def guard():
    require(not any(k.startswith(("PG", "LIBPQ", "LD_PRELOAD", "LD_AUDIT"))
                    or k in {"DATABASE_URL", "SUPABASE_DB_URL"} for k in os.environ),
            "clear connection and loader overrides")
    require(hashlib.sha256(CA.read_bytes()).hexdigest() == CA_HASH, "CA pin mismatch")
    require(sys.executable.startswith("/data/data/com.termux/files/usr/"), "Termux required")


def open_session(role, password, *, address=None, app="hallo-gps-recovery-rehearsal"):
    import psycopg
    return psycopg.connect(host=HOST, port=5432, dbname="postgres", hostaddr=address,
                           user=role+"."+REF, password=password,
                           sslmode="verify-full", sslrootcert=str(CA),
                           require_auth="scram-sha-256", sslcertmode="disable",
                           gssencmode="disable", passfile="/dev/null", connect_timeout=8,
                           tcp_user_timeout=5000, keepalives_idle=5, keepalives_interval=2, keepalives_count=2,
                           application_name=app, autocommit=True)


def attributed_rejection(exc, role, address, attempt):
    # Attribute the response on the failed startup socket itself. Generic
    # Supavisor FATALs do not name a role. Never classify pasted/logged text.
    if role not in (ROLE, TEST_ROLE):
        return False
    conn = exc.pgconn
    if conn is None:
        return False
    user = f"{role}.{REF}".encode()
    if (conn.user, conn.host, conn.hostaddr, conn.port, conn.db) != (
            user, HOST.encode(), address.encode(), b"5432", b"postgres"):
        return False
    opts = {item.keyword: item.val for item in conn.info}
    if (opts.get(b"application_name"), opts.get(b"sslmode"), opts.get(b"sslrootcert")) != (
            attempt.encode(), b"verify-full", str(CA).encode()):
        return False
    # PQerrorMessage can include a connection prefix. Reject combined failures,
    # DETAIL/HINT text, and different EAUTHQUERY causes (including timeouts).
    line = conn.error_message.rstrip(b"\n")
    if b"\n" in line or b"\r" in line:
        return False
    prefix, fatal, reason = line.partition(b"FATAL:")
    if not fatal or (prefix and not re.fullmatch(rb"connection to server at [^\r\n]+ failed: ", prefix)):
        return False
    role = role.encode()
    return reason.strip() in {
        b"(EAUTHQUERY) user not found in the database",
        b'password authentication failed for user "' + role + b'"',
        b'role "' + role + b'" is not permitted to log in',
        b'password authentication failed for user "' + user + b'"',
        b'role "' + user + b'" is not permitted to log in',
    }


def fresh_denial(observer, role, password, address, marker, expected_oid):
    from psycopg import OperationalError
    # Independent autocommit reads bracket this one TLS-verified reconnect.
    # The original login succeeded with the same credentials and peer address.
    from psycopg.pq import TransactionStatus
    require(observer.autocommit and observer.info.transaction_status == TransactionStatus.IDLE,
            "independent revocation observation required")
    def revoked_oid():
        return scalar(observer, """SELECT (SELECT oid FROM pg_authid
            WHERE rolname=%s AND NOT rolcanlogin AND rolpassword IS NULL
            AND shobj_description(oid,'pg_authid')=%s)""", (role, marker))

    oid = revoked_oid()
    require(oid is not None and oid == expected_oid, "committed revocation missing")
    attempt = "hallo-gps-denial-" + secrets.token_hex(12)
    try:
        with open_session(role, password, address=address, app=attempt):
            pass
    except OperationalError as exc:
        require(attributed_rejection(exc, role, address, attempt), "fresh authentication rejection inconclusive")
        require(revoked_oid() == oid, "revoked role changed during fresh login")
        return
    raise RuntimeError("revoked pooler credential accepted")


def scalar(c, query, args=()):
    return c.execute(query, args).fetchone()[0]


def counts(c):
    return c.execute("""SELECT (SELECT count(*) FROM hallo_gps_qa.device_mapping),
                     (SELECT count(*) FROM hallo_gps_qa.positions)""").fetchone()


# Scheduled in the same transaction as LOGIN. Never depends on the phone for revocation.
TEST_ROLE = "hallo_gps_qa_recovery_test"
TEST_JOB = "hallo-gps-qa-recovery-test"


def recovery_sql(role, job):
    require((role, job) in {(ROLE, JOB), (TEST_ROLE, TEST_JOB)}, "unexpected recovery target")
    terminate = f"""PERFORM pg_catalog.pg_terminate_backend(pid, 2000) FROM pg_catalog.pg_stat_activity
    WHERE usename='{role}' AND pid<>pg_backend_pid();"""
    declaration = ""
    if role == TEST_ROLE:
        declaration = "DECLARE target record;"
        terminate = f"""FOR target IN SELECT pid, extract(epoch FROM backend_start)::text AS started
           FROM pg_catalog.pg_stat_activity WHERE usename='{role}' AND pid<>pg_backend_pid()
         LOOP
           IF pg_catalog.pg_terminate_backend(target.pid, 2000) THEN
             PERFORM pg_catalog.pg_notify('hallo_gps_recovery_evidence',target.pid::text || '/' || target.started);
           END IF;
         END LOOP;"""
    # Each cron invocation commits exactly one stage. A failed final stage is retryable.
    return f"""
DO $watch$
{declaration}
BEGIN
 PERFORM set_config('lock_timeout','2s',true);
 IF NOT EXISTS (SELECT FROM pg_catalog.pg_authid WHERE rolname='{role}'
                AND rolvaliduntil <= clock_timestamp()) THEN RETURN; END IF;
 IF EXISTS (SELECT FROM pg_catalog.pg_authid WHERE rolname='{role}'
            AND (rolcanlogin OR rolpassword IS NOT NULL)) THEN
   ALTER ROLE {role} NOLOGIN PASSWORD NULL;
   RETURN;
 END IF;
 IF EXISTS (SELECT FROM pg_catalog.pg_stat_activity WHERE usename='{role}') THEN
   {terminate}
   RETURN;
 END IF;
 IF NOT cron.unschedule('{job}') THEN RAISE EXCEPTION 'unschedule failed'; END IF;
END $watch$;
"""


WATCH = recovery_sql(ROLE, JOB)


def probe_denial(c, query, code):
    import psycopg
    try:
        with c.transaction(force_rollback=True):
            c.execute(query)
    except psycopg.Error as exc:
        require(exc.sqlstate == code, "unexpected denial reason")
        return
    raise RuntimeError("expected operation denial")


def positions(c):
    from datetime import datetime, timedelta, timezone
    received = datetime.now(timezone.utc)
    rows = [(i, DEVICE, TRUCK, received - timedelta(minutes=i), received, 9., 38.)
            for i in (1, 2)]
    fields = "source_id, device_key, truck_id, fix_time, received_at, latitude, longitude"
    insert = f"INSERT INTO hallo_gps_qa.positions ({fields}) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING"
    for expected in (1, 0):
        with c.transaction():
            for row in rows:
                require(c.execute(insert, row).rowcount == expected, "replay count mismatch")
            require(c.execute(f"SELECT {fields} FROM hallo_gps_qa.positions ORDER BY source_id").fetchall()
                    == rows, "timestamp, mapping or content mismatch")
    for query in ("UPDATE hallo_gps_qa.positions SET latitude=0 WHERE false",
                  "DELETE FROM hallo_gps_qa.positions WHERE false",
                  "DELETE FROM hallo_gps_qa.device_mapping WHERE false",
                  "CREATE TABLE hallo_gps_qa.phase2_denied(i integer)"):
        probe_denial(c, query, "42501")
    for truck, fix, code in (("unmapped", "now()", "23503"),
                             (TRUCK, "now()+interval '1 hour'", "23514")):
        probe_denial(c, f"INSERT INTO hallo_gps_qa.positions ({fields}) VALUES "
                     f"(3,'{DEVICE}','{truck}',{fix},now(),9,38)", code)


def activation_gate():
    raise RuntimeError("activation locked pending independent recovery and pooler tests")


def writer_backend(writer):
    row = writer.execute("""SELECT pid, backend_start FROM pg_stat_activity
                         WHERE pid=pg_backend_pid() AND usename=%s AND session_user=%s
                         AND current_user=session_user AND current_database()='postgres'""",
                         (ROLE, ROLE)).fetchone()
    require(row is not None, "writer identity mismatch")
    return row


def terminate_original(admin, backend):
    result = admin.execute("""SELECT pg_terminate_backend(pid,2000) FROM pg_stat_activity
                           WHERE usename=%s AND pid=%s AND backend_start=%s""",
                           (ROLE, *backend)).fetchone()
    return result == (True,)


def run(admin):
    guard()
    activation_gate()
    from psycopg import sql
    from psycopg.pq import TransactionStatus
    require(admin.autocommit and admin.info.transaction_status == TransactionStatus.IDLE, "owner transaction active")
    conn = admin.pgconn
    opts = {item.keyword: item.val for item in conn.info}
    require((conn.host, conn.user, conn.port, conn.db, opts.get(b"sslmode"), opts.get(b"sslrootcert")) ==
            (HOST.encode(), f"postgres.{REF}".encode(), b"5432", b"postgres", b"verify-full", str(CA).encode()),
            "owner QA transport mismatch")
    require(conn.ssl_in_use, "owner TLS required")
    address = str(ipaddress.ip_address(admin.info.hostaddr))
    marker = "HALLO GPS QA exporter login v1"
    oid = scalar(admin, """SELECT (SELECT oid FROM pg_authid WHERE rolname=%s AND NOT rolcanlogin
                 AND rolpassword IS NULL AND shobj_description(oid,'pg_authid')=%s)""", (ROLE, marker))
    require(oid is not None, "managed writer baseline mismatch")
    require(admin.execute("SELECT current_user,current_database()").fetchone()
            == ("postgres", "postgres"), "unexpected administrator identity")
    require(counts(admin) == (0, 0), "QA baseline must be empty")
    require(scalar(admin, """SELECT NOT (rolcanlogin OR rolsuper OR rolcreaterole OR
                    rolcreatedb OR rolreplication OR rolbypassrls)
                    FROM pg_roles WHERE rolname=%s""", (ROLE,)), "writer baseline mismatch")
    require(scalar(admin, "SELECT count(*) FROM cron.job WHERE jobname=%s", (JOB,)) == 0,
            "recovery job already exists")
    password = secrets.token_urlsafe(48)
    activated = False
    writer = None
    backend = None
    try:
        with admin.transaction():
            admin.execute("LOCK TABLE hallo_gps_qa.device_mapping,hallo_gps_qa.positions IN EXCLUSIVE MODE")
            require(counts(admin) == (0, 0), "baseline changed")
            job_id = scalar(admin, "SELECT cron.schedule(%s,'* * * * *',%s)", (JOB, WATCH))
            expiry = scalar(admin, "SELECT clock_timestamp()+interval '10 minutes'")
            verifier = admin.pgconn.encrypt_password(password.encode(), ROLE.encode(), b"scram-sha-256")
            admin.execute(sql.SQL("ALTER ROLE hallo_gps_qa_ingest LOGIN PASSWORD {} VALID UNTIL {}")
                          .format(sql.Literal(verifier.decode()), sql.Literal(expiry.isoformat())))
            admin.execute("INSERT INTO hallo_gps_qa.device_mapping VALUES (%s,%s)", (DEVICE, TRUCK))
            activated = True  # Includes an ambiguous commit acknowledgement.
        writer = open_session(ROLE, password, address=address, app="hallo-gps-qa-phase2")
        require(writer.info.hostaddr == address, "writer peer mismatch")
        backend = writer_backend(writer)
        writer.execute("SET statement_timeout=10000")
        writer.execute("SET lock_timeout=3000")
        positions(writer)
        require(writer_backend(writer) == backend, "writer backend changed")
    finally:
        try:
            if activated:
                admin.execute("ALTER ROLE hallo_gps_qa_ingest NOLOGIN PASSWORD NULL")
                killed_original = backend is not None and terminate_original(admin, backend)
                admin.execute("SELECT pg_terminate_backend(pid,2000) FROM pg_stat_activity WHERE usename=%s", (ROLE,))
                require(scalar(admin, "SELECT count(*) FROM pg_stat_activity WHERE usename=%s", (ROLE,)) == 0,
                        "writer sessions remain")
                require(killed_original, "original writer termination unverified")
                fresh_denial(admin, ROLE, password, address, marker, oid)
                admin.execute("SELECT cron.unschedule(jobid) FROM cron.job WHERE jobid=%s AND jobname=%s AND command=%s",
                              (job_id, JOB, WATCH))
                require(scalar(admin, "SELECT count(*) FROM cron.job WHERE jobname=%s", (JOB,)) == 0,
                        "writer recovery job remains")
                print("Post-cleanup mapping and position counts", counts(admin))
        finally:
            if writer is not None:
                writer.close()
            del password
    require(counts(admin) == (1, 2), "final counts differ")


def main():
    guard()
    activation_gate()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Phase 2 stopped", file=sys.stderr)
        sys.exit(1)
