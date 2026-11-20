BEGIN;
CREATE ROLE hallo_gps_qa_test_outsider NOLOGIN;
-- Managed PostgreSQL may grant the executor ADMIN without SET.
-- Both SET options are temporary and roll back with the fixtures.
DO $$
BEGIN
  EXECUTE format('GRANT hallo_gps_qa_ingest TO %I WITH SET TRUE', current_user);
  EXECUTE format('GRANT hallo_gps_qa_test_outsider TO %I WITH SET TRUE', current_user);
END $$;
INSERT INTO hallo_gps_qa.device_mapping VALUES ('0012345678', 'qa-truck');

SET LOCAL ROLE hallo_gps_qa_ingest;
INSERT INTO hallo_gps_qa.positions (source_id, device_key, truck_id, fix_time, latitude, longitude)
VALUES (1, '0012345678', 'qa-truck', transaction_timestamp(), 9, 38)
ON CONFLICT DO NOTHING;
INSERT INTO hallo_gps_qa.positions (source_id, device_key, truck_id, fix_time, latitude, longitude)
VALUES (2, '0012345678', 'qa-truck', transaction_timestamp(), 9, 38)
ON CONFLICT DO NOTHING;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user
             AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)) THEN
    RAISE EXCEPTION 'Expected an inactive and unprivileged writer login';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'hallo_gps_qa.positions'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'hallo_gps_qa.device_mapping'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Expected RLS on both QA tables';
  END IF;
  IF has_schema_privilege(current_user, 'hallo_gps_qa', 'CREATE')
     OR has_table_privilege(current_user, 'hallo_gps_qa.positions', 'UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege(current_user, 'hallo_gps_qa.device_mapping', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Unexpected staging writer privilege';
  END IF;
  IF (SELECT count(*) FROM hallo_gps_qa.positions) <> 1 THEN
    RAISE EXCEPTION 'Expected duplicate replay to be ignored';
  END IF;
  BEGIN
    INSERT INTO hallo_gps_qa.positions (source_id, device_key, truck_id, fix_time, latitude, longitude)
    VALUES (3, '0012345678', 'unapproved-truck', now(), 9.1, 38);
    RAISE EXCEPTION 'Expected mismatched mapping rejection';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO hallo_gps_qa.positions (source_id, device_key, truck_id, fix_time, latitude, longitude)
    VALUES (4, '0012345678', 'qa-truck', now() + interval '1 hour', 9, 38);
    RAISE EXCEPTION 'Expected future timestamp rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE hallo_gps_qa.device_mapping SET truck_id = 'stolen';
    RAISE EXCEPTION 'Expected mapping write denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SET LOCAL ROLE hallo_gps_qa_test_outsider;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM hallo_gps_qa.positions;
    RAISE EXCEPTION 'Expected unprivileged read denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
