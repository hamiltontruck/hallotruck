"""Exercise the writer and independent cleanup on a socket-only pg_cron cluster."""
from pathlib import Path
import runpy
import sys
from unittest.mock import patch

import psycopg

here = Path(__file__).resolve().parent
runner = runpy.run_path(str(here / "owner-phase2.py"))
cluster = runpy.run_path(str(here / "disposable-heartbeat-test.py"))["disposable_cluster"]


def exercise(directory):
    def connect(user, password=None, **kwargs):
        return psycopg.connect(host=directory, port=55440, dbname="postgres",
                               user=user, password=password, autocommit=True)

    with connect("postgres") as admin, connect("postgres") as observer:
        admin.execute("CREATE EXTENSION pg_cron")
        for name in ("install.sql", "prepare-writer.sql"):
            admin.execute((here / name).read_text())
        # Local PostgreSQL has no Supavisor routing. The separate denial suite
        # exercises the pinned TLS startup and scoped diagnostic classifier.
        def local_denial(exc, role, address, attempt):
            return f'role "{role}" is not permitted to log in'.encode() in exc.pgconn.error_message

        with patch.dict(runner["run"].__globals__, owner_peer=lambda c: c.info.hostaddr,
                        open_session=connect, attributed_rejection=local_denial):
            runner["run"](admin, observer)
            try:
                runner["run"](admin, observer)
            except RuntimeError as exc:
                assert str(exc) == "QA baseline must be empty"
            else:
                raise AssertionError("repeat run accepted")
        assert runner["counts"](observer) == (1, 2)
        assert observer.execute("""SELECT NOT rolcanlogin, rolpassword IS NULL,
            (SELECT count(*) FROM pg_stat_activity WHERE usename=a.rolname),
            (SELECT count(*) FROM cron.job) FROM pg_authid a WHERE rolname=%s""",
            (runner["ROLE"],)).fetchone() == (True, True, 0, 0)
        print("PASS disposable writer: replay, timestamps, permissions, revocation, zero sessions/jobs, repeat refused")


if __name__ == "__main__":
    cluster(Path(sys.argv[1]).resolve(strict=True), exercise)
