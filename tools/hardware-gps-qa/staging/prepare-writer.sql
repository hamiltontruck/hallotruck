-- Prepare the disabled exporter login on disposable PostgreSQL or HALLO GPS QA
-- (rmnjhdlbhfcmlvzqtblm). Activation and password provisioning are separate.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('hallo_gps_qa:bootstrap', 0));
DO $prepare$
BEGIN
  IF obj_description(to_regnamespace('hallo_gps_qa'), 'pg_namespace')
       IS DISTINCT FROM 'HALLO GPS QA schema v1'
     OR to_regrole('hallo_gps_qa_writer') IS NULL THEN
    RAISE EXCEPTION 'Install the managed HALLO GPS QA schema first';
  END IF;
  IF to_regrole('hallo_gps_qa_ingest') IS NOT NULL THEN
    IF shobj_description(to_regrole('hallo_gps_qa_ingest'), 'pg_authid')
         IS DISTINCT FROM 'HALLO GPS QA exporter login v1'
       OR NOT pg_has_role('hallo_gps_qa_ingest', 'hallo_gps_qa_writer', 'USAGE')
       OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hallo_gps_qa_ingest'
                  AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
       OR EXISTS (SELECT 1 FROM pg_auth_members
                  WHERE member = to_regrole('hallo_gps_qa_ingest')
                    AND (roleid <> to_regrole('hallo_gps_qa_writer') OR admin_option)) THEN
      RAISE EXCEPTION 'Refusing to reuse an unmanaged or privileged GPS QA login';
    END IF;
    RETURN;
  END IF;
  CREATE ROLE hallo_gps_qa_ingest NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT hallo_gps_qa_writer TO hallo_gps_qa_ingest;
  COMMENT ON ROLE hallo_gps_qa_ingest IS 'HALLO GPS QA exporter login v1';
END
$prepare$;
COMMIT;
