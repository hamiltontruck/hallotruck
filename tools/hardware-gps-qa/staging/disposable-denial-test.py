"""Local TLS/SCRAM regression for post-revocation pooler diagnostics (no cloud access)."""
from pathlib import Path
import runpy
import secrets
import subprocess
import sys
import tempfile
from unittest.mock import patch

import psycopg
from psycopg import sql

probe = runpy.run_path(str(Path(__file__).with_name("hosted-recovery-test.py")))
role, config = probe["ROLE"], probe["runner"]
address = "127.0.0.1"
tag = "hallo-gps-denial-fixture"
marker = "disposable fixture"
scoped_user = f"{role}.{config['REF']}"


def rejected(callback):
    try:
        callback()
    except RuntimeError:
        return
    raise AssertionError("unexpected PASS")


def exercise(path):
    pw = secrets.token_urlsafe(48)
    with psycopg.connect(host=str(path), dbname="postgres", user="postgres", autocommit=True) as owner:
        # Real PostgreSQL receives the scoped startup username literally. The
        # catalog observer uses the unscoped role, as it would behind Supavisor.
        for name in (role, scoped_user):
            owner.execute(sql.SQL("CREATE ROLE {} LOGIN").format(sql.Identifier(name)))
            verifier = owner.pgconn.encrypt_password(pw.encode(), name.encode(), b"scram-sha-256")
            owner.execute(sql.SQL("ALTER ROLE {} PASSWORD {}").format(sql.Identifier(name),sql.Literal(verifier.decode())))
        owner.execute(sql.SQL("COMMENT ON ROLE {} IS {}").format(sql.Identifier(role),sql.Literal(marker)))
        with probe["open_session"](role,pw,address=address) as first:
            assert first.info.hostaddr == address
        check = lambda: probe["fresh_denial"](owner,pw,address,marker)
        rejected(check)  # still LOGIN, password present
        owner.execute(sql.SQL("ALTER ROLE {} NOLOGIN PASSWORD NULL").format(sql.Identifier(role)))
        rejected(check)  # revoked catalog role but fresh socket was actually accepted
        owner.execute(sql.SQL("ALTER ROLE {} NOLOGIN PASSWORD NULL").format(sql.Identifier(scoped_user)))
        check()  # Real named PostgreSQL FATAL, with the revoked role still present.
        try:
            probe["open_session"](role,pw,address=address,app=tag)
        except psycopg.OperationalError as exc:
            failure = exc
        else:
            raise AssertionError("expected SCRAM rejection")
        conn = failure.pgconn
        assert conn and conn.hostaddr == address.encode()
        # Replay just the Supavisor-specific wire message on the real failed
        # libpq connection snapshot. Do not pretend PostgreSQL emitted EAUTHQUERY.
        conn.error_message = b'connection to server at "local", port 5432 failed: FATAL:  (EAUTHQUERY) user not found in the database\n'
        classify = lambda: probe["attributed_rejection"](failure,address,tag)
        assert classify()
        for field, value in (("user",role.encode()),("user",b"another.project"),
                             ("host",b"other"),("hostaddr",b"127.0.0.2"),("port",b"6543"),("db",b"other")):
            with patch.object(conn,field,value):
                assert not classify()
        assert not probe["attributed_rejection"](failure,address,"different-attempt")
        for msg in (b"timeout", b"FATAL: (EAUTHQUERY) auth_query secret check timed out",
                    b"FATAL: user not found", b'FATAL: password authentication failed for user "other"',
                    conn.error_message+b"connection timed out"):
            with patch.object(conn,"error_message",msg):
                assert not classify()
        assert not probe["attributed_rejection"](psycopg.OperationalError("timeout"),address,tag)
        # Drive the full bracketing logic with this same attributed attempt.
        with patch.dict(probe["fresh_denial"].__globals__,open_session=lambda *a,**kw: raise_failure(kw)), patch.object(secrets,"token_hex",return_value="fixture"):
            def raise_failure(kw):
                assert kw == {"address":address,"app":tag}
                raise failure
            check()
            with owner.transaction():
                rejected(check)  # autocommit connection inside an explicit transaction
            rejected(lambda: probe["fresh_denial"](owner,pw,address,"wrong rehearsal"))
        print("PASS real TLS/SCRAM setup and rejection, EAUTHQUERY fixture, role state, login acceptance, target/attempt mismatches, ambiguous errors and timeouts")


if __name__ == "__main__":
    binaries = Path(sys.argv[1]).resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="gps-denial-",dir="/tmp") as tmp:
        path = Path(tmp)
        data = path/"db"
        ca,key = path/"cert.pem",path/"key.pem"
        subprocess.run(["openssl","req","-x509","-newkey","rsa:2048","-nodes","-days","1",
                        "-subj","/CN=localhost","-addext","subjectAltName=DNS:"+config["HOST"],
                        "-keyout",key,"-out",ca],check=True,stderr=subprocess.DEVNULL)
        subprocess.run([binaries/"initdb","-D",data,"-A","trust","-U","postgres","--no-locale","--encoding=UTF8"],check=True,stdout=subprocess.DEVNULL)
        (data/"pg_hba.conf").write_text("local all all trust\nhostssl all all 127.0.0.1/32 scram-sha-256\n")
        opts = f"-k {tmp} -p 5432 -c listen_addresses=127.0.0.1 -c ssl=on -c ssl_cert_file={ca} -c ssl_key_file={key}"
        subprocess.run([binaries/"pg_ctl","-D",data,"-l",path/"log","-o",opts,"start"],check=True)
        try:
            with patch.dict(config,CA=ca):
                exercise(path)
        finally:
            subprocess.run([binaries/"pg_ctl","-D",data,"stop","-m","immediate"],check=True)
