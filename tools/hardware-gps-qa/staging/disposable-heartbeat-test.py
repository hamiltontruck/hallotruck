"""Exercise the recovery proof on a private socket-only pg_cron cluster."""
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import time

import psycopg

probe = runpy.run_path(str(Path(__file__).with_name("hosted-recovery-test.py")))
role, job = probe["ROLE"], probe["JOB"]
watch = probe["runner"]["recovery_sql"](role, job)


def exercise(directory):
    def connect(user):
        return psycopg.connect(host=directory, port=55440, dbname="postgres",
                               user=user, autocommit=True)
    with connect("postgres") as observer:
        observer.execute("CREATE EXTENSION pg_cron")
        observer.execute(f"CREATE ROLE {role} LOGIN")
        observer.execute("LISTEN hallo_gps_recovery_evidence")
        with connect(role) as writer:
            identity = probe["heartbeat"](writer)
            observer.execute(f"DO $$ BEGIN EXECUTE format('ALTER ROLE {role} VALID UNTIL %L',"
                             "clock_timestamp()+interval '5 seconds'); END $$")
            job_id = observer.execute("SELECT cron.schedule(%s,'5 seconds',%s)", (job, watch)).fetchone()[0]
            start = time.monotonic()
            probe["prove_termination"](observer, writer, job_id, identity, start+40)
            print(f"PASS verified cron sender and original backend {identity} in {time.monotonic()-start:.1f}s")
        for _ in range(15):
            if probe["job_count"](observer) == 0:
                break
            time.sleep(1)
        assert probe["job_count"](observer) == 0
        assert probe["state"](observer, role) == (True, True, 0)
        observer.execute(f"ALTER ROLE {role} LOGIN VALID UNTIL 'infinity'")
        for failure in ("early disconnect", "timeout"):
            with connect(role) as writer:
                identity = probe["heartbeat"](writer)
                if failure == "early disconnect":
                    observer.execute("SELECT pg_terminate_backend(%s,2000)", (int(identity.split('/')[0]),))
                else:
                    writer.execute("SET statement_timeout='1ms'")
                try:
                    if failure == "timeout":
                        # Exercise an actual server timeout on the heartbeat query.
                        from unittest.mock import patch
                        def delayed(connection):
                            connection.execute("SELECT pg_sleep(1)")
                        with patch.dict(probe["prove_termination"].__globals__,heartbeat=delayed):
                            probe["prove_termination"](observer,writer,job_id,identity,time.monotonic()+4)
                    else:
                        probe["prove_termination"](observer,writer,job_id,identity,time.monotonic()+4)
                except RuntimeError as exc:
                    assert str(exc) == "early disconnect or unconfirmed server termination"
                else:
                    raise AssertionError(f"{failure} accepted")
                print("PASS rejected", failure)


def disposable_cluster(binaries, test):
    with tempfile.TemporaryDirectory(prefix="gps-heartbeat-",dir="/tmp") as tmp:
        data = Path(tmp)/"db"
        subprocess.run([binaries/"initdb","-D",data,"-A","trust","-U","postgres","--no-locale",
                        "--encoding=UTF8"],check=True,stdout=subprocess.DEVNULL)
        opts = (f"-k {tmp} -p 55440 -c listen_addresses='' -c shared_preload_libraries=pg_cron "
                "-c cron.database_name=postgres -c cron.use_background_workers=on")
        subprocess.run([binaries/"pg_ctl","-D",data,"-l",Path(tmp)/"server.log","-o",opts,"start"],check=True)
        try:
            test(tmp)
        finally:
            subprocess.run([binaries/"pg_ctl","-D",data,"stop","-m","immediate"],check=True)


if __name__ == "__main__":
    disposable_cluster(Path(sys.argv[1]).resolve(strict=True), exercise)
