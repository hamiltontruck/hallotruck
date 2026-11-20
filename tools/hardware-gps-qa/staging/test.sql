BEGIN;
CREATE ROLE hallo_gps_qa_test_outsider NOLOGIN;
INSERT INTO hallo_gps_qa.device_mapping VALUES ('0012345678', 'qa-truck');

SET LOCAL ROLE hallo_gps_qa_writer;
INSERT INTO hallo_gps_qa.positions (source_id, device_key, truck_id, fix_time, latitude, longitude)
VALUES (1, '0012345678', 'qa-truck', transaction_timestamp(), 9, 38)
ON CONFLICT DO NOTHING;
INSERT INTO hallo_gps_qa.positions (source_id, device_key, truck_id, fix_time, latitude, longitude)
VALUES (2, '0012345678', 'qa-truck', transaction_timestamp(), 9, 38)
ON CONFLICT DO NOTHING;
DO $$
BEGIN
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
