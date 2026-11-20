-- Apply explicitly to a disposable database or the approved HALLO staging project.
-- This file lives outside the application's automatic migration path.
BEGIN;
CREATE SCHEMA hallo_gps_qa;
CREATE ROLE hallo_gps_qa_writer NOLOGIN;
REVOKE ALL ON SCHEMA hallo_gps_qa FROM PUBLIC;
GRANT USAGE ON SCHEMA hallo_gps_qa TO hallo_gps_qa_writer;

CREATE TABLE hallo_gps_qa.device_mapping (
  device_key text PRIMARY KEY CHECK (device_key ~ '^[A-Za-z0-9_-]{1,64}$'),
  truck_id text NOT NULL UNIQUE CHECK (truck_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  UNIQUE (device_key, truck_id)
);
CREATE TABLE hallo_gps_qa.positions (
  source_id bigint PRIMARY KEY CHECK (source_id > 0),
  device_key text NOT NULL,
  truck_id text NOT NULL,
  fix_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  speed_kmh double precision CHECK (speed_kmh BETWEEN 0 AND 250),
  heading double precision CHECK (heading >= 0 AND heading < 360),
  ignition boolean,
  FOREIGN KEY (device_key, truck_id) REFERENCES hallo_gps_qa.device_mapping (device_key, truck_id),
  UNIQUE (device_key, fix_time, latitude, longitude),
  CHECK (isfinite(fix_time) AND isfinite(received_at) AND fix_time <= received_at + interval '5 minutes'
    AND fix_time >= received_at - interval '1 day')
);
ALTER TABLE hallo_gps_qa.device_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallo_gps_qa.positions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hallo_gps_qa FROM PUBLIC;
GRANT SELECT ON hallo_gps_qa.device_mapping TO hallo_gps_qa_writer;
GRANT SELECT ON hallo_gps_qa.positions TO hallo_gps_qa_writer;
GRANT INSERT (source_id, device_key, truck_id, fix_time, received_at, latitude, longitude, speed_kmh, heading, ignition)
  ON hallo_gps_qa.positions TO hallo_gps_qa_writer;
CREATE POLICY writer_read_mapping ON hallo_gps_qa.device_mapping
  FOR SELECT TO hallo_gps_qa_writer USING (true);
CREATE POLICY writer_read_positions ON hallo_gps_qa.positions
  FOR SELECT TO hallo_gps_qa_writer USING (true);
CREATE POLICY writer_insert_positions ON hallo_gps_qa.positions
  FOR INSERT TO hallo_gps_qa_writer WITH CHECK (true);
COMMIT;
