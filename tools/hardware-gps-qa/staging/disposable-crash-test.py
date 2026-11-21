"""Test the locked runner's WATCH SQL on a fresh private PostgreSQL 17 cluster.

Usage: python disposable-crash-test.py /absolute/path/to/pg17/bin
The PostgreSQL installation must include pg_cron. Allows fifteen minutes, including a forced lock timeout and retry.
Only a private Unix socket is enabled. The test creates no telemetry tables.
"""
from pathlib import Path
import runpy
import signal
import subprocess
import sys
import tempfile
import time


def check(ok, message):
    if not ok:
        raise RuntimeError(message)


def test(bindir, scratch):
    data = scratch / "db"
    env = dict(PATH="/usr/bin:/bin", LC_ALL="C", PGHOST=str(scratch), PGPORT="55439",
               PGDATABASE="postgres", PGUSER="postgres", PGPASSFILE=str(scratch / "no-password-file"))
    runner = runpy.run_path(str(Path(__file__).with_name("owner-phase2.py")))
    watch = runner["recovery_sql"](runner["TEST_ROLE"], runner["TEST_JOB"])

    def command(program, *args, **kwargs):
        return subprocess.run([bindir / program, *args], env=env, check=True, **kwargs)

    def psql_args(query):
        return [bindir / "psql", "-XAtqw", "-v", "ON_ERROR_STOP=1", "-c", query]

    def scalar(query):
        return subprocess.check_output(psql_args(query), env=env, text=True).strip()

    def session(query, user):
        return subprocess.Popen(psql_args(query), env=dict(env, PGUSER=user),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    command("initdb", "-D", data, "-A", "trust", "-U", "postgres", "--no-locale")
    options = (f"-k {scratch} -p 55439 -c listen_addresses='' "
               "-c shared_preload_libraries=pg_cron -c cron.database_name=postgres "
               "-c cron.use_background_workers=on")
    command("pg_ctl", "-D", data, "-l", scratch / "server.log", "-o", options, "start")
    children = []
    try:
        check(scalar("SHOW data_directory") == str(data), "unexpected disposable cluster")
        scalar("""CREATE EXTENSION pg_cron;
               CREATE ROLE hallo_gps_qa_recovery_test NOLOGIN;
               CREATE ROLE executor LOGIN CREATEROLE;
               GRANT SELECT (rolname,rolvaliduntil,rolcanlogin,rolpassword) ON pg_catalog.pg_authid TO executor;
               GRANT hallo_gps_qa_recovery_test TO executor WITH ADMIN TRUE, SET FALSE, INHERIT FALSE;
               GRANT pg_signal_backend TO executor;
               GRANT USAGE ON SCHEMA cron TO executor""")
        # Nonsecret catalog sentinel exercises password clearing without provisioning a secret.
        activation = """BEGIN;
            SELECT cron.schedule('hallo-gps-qa-recovery-test','* * * * *',$job$""" + watch + """$job$);
            DO $$ BEGIN EXECUTE format('ALTER ROLE hallo_gps_qa_recovery_test LOGIN PASSWORD %L VALID UNTIL %L',
                'md5'||repeat('0',32),clock_timestamp()+interval '10 minutes'); END $$;
            COMMIT; SELECT pg_sleep(900)"""
        scalar(activation.split("COMMIT;")[0] + "ROLLBACK")
        check(scalar("SELECT NOT rolcanlogin AND rolpassword IS NULL FROM pg_authid WHERE rolname='hallo_gps_qa_recovery_test'") == "t"
              and scalar("SELECT count(*) FROM cron.job") == "0", "activation rollback failed")
        print("PASS activation rollback", flush=True)
        started = time.monotonic()
        client = session(activation, "executor")
        children.append(client)
        for _ in range(50):
            if scalar("""SELECT rolcanlogin AND rolpassword IS NOT NULL FROM pg_authid
                      WHERE rolname='hallo_gps_qa_recovery_test'""") == "t":
                break
            time.sleep(.1)
        else:
            raise RuntimeError("activation commit missing")
        client.send_signal(signal.SIGKILL)
        check(client.wait() == -signal.SIGKILL, "activation client survived")
        writer = session("SELECT pg_sleep(900)", "hallo_gps_qa_recovery_test")
        children.append(writer)
        for _ in range(50):
            pid = scalar("SELECT pid FROM pg_stat_activity WHERE usename='hallo_gps_qa_recovery_test'")
            if pid:
                break
            time.sleep(.1)
        else:
            raise RuntimeError("writer session missing")
        print("Post-commit SIGKILL, active writer PID", pid, flush=True)
        locker = session("BEGIN; LOCK TABLE cron.job IN SHARE MODE; SELECT pg_sleep(900)", "postgres")
        children.append(locker)
        timeout_seen = False
        while time.monotonic() - started < 900:
            revoked = scalar("""SELECT NOT rolcanlogin AND rolpassword IS NULL AND NOT EXISTS
                             (SELECT FROM pg_stat_activity WHERE usename='hallo_gps_qa_recovery_test')
                             FROM pg_authid WHERE rolname='hallo_gps_qa_recovery_test'""")
            elapsed = time.monotonic() - started
            if revoked == "t" and not timeout_seen and scalar("SELECT count(*) FROM cron.job_run_details WHERE status='failed' AND return_message LIKE '%lock timeout%'") != "0":
                check(scalar("SELECT count(*) FROM cron.job") == "1", "retry job lost")
                timeout_seen = True
                print(f"PASS unschedule lock timeout, revocation survived rollback at {elapsed:.1f}s", flush=True)
                scalar("SELECT pg_terminate_backend(pid,2000) FROM pg_stat_activity WHERE query LIKE 'BEGIN; LOCK TABLE cron.job%'")
                locker.wait(timeout=5)
            if timeout_seen and revoked == "t" and writer.poll() not in (0, None) and elapsed < 900 and scalar("SELECT count(*) FROM cron.job") == "0":
                print(f"PASS NOLOGIN, password NULL, zero writer sessions, "
                      f"client exit {writer.returncode}, elapsed {elapsed:.1f}s")
                return
            time.sleep(3)
        raise RuntimeError("900-second deadline missed")
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
            child.wait()
        command("pg_ctl", "-D", data, "stop", "-m", "immediate")


if __name__ == "__main__":
    check(len(sys.argv) == 2, "supply the disposable PostgreSQL bin directory")
    with tempfile.TemporaryDirectory(dir="/tmp", prefix="gps-recovery-") as tmp:
        test(Path(sys.argv[1]).resolve(strict=True), Path(tmp))
