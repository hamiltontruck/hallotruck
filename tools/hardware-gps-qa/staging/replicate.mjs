import { spawn } from "node:child_process";

const STAGING_REF = "rmnjhdlbhfcmlvzqtblm";
// Pin the project-specific hostname from Dashboard > Connect > Session pooler.
const STAGING_POOLER_HOST = "aws-1-eu-central-1.pooler.supabase.com";
const STAGING_USER = `hallo_gps_qa_ingest.${STAGING_REF}`;
const BATCH_SIZE = 250;

export function stagingPoolerTarget() {
  return {
    HALLO_GPS_STAGING_PROJECT_REF: STAGING_REF,
    PGHOST: STAGING_POOLER_HOST,
    PGPORT: "5432",
    PGUSER: STAGING_USER,
  };
}

export function stagingConnection(env) {
  const target = stagingPoolerTarget();
  if (env.HALLO_GPS_ENV !== "qa" || env.HALLO_GPS_STAGING_PROJECT_REF !== target.HALLO_GPS_STAGING_PROJECT_REF ||
      env.PGHOST !== target.PGHOST || env.PGPORT !== target.PGPORT || env.PGUSER !== target.PGUSER || !env.PGPASSWORD) {
    throw new Error("Confirmed staging project, exact Session Pooler host and port, and dedicated staging login required");
  }
  return {
    PATH: env.PATH,
    PGHOST: target.PGHOST,
    PGPORT: target.PGPORT,
    PGDATABASE: "postgres",
    PGUSER: target.PGUSER,
    PGPASSWORD: env.PGPASSWORD,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "system",
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "hallo-gps-qa",
  };
}

export function insertBatchSql(points) {
  const encoded = Buffer.from(JSON.stringify(points), "utf8").toString("base64");
  return `
    BEGIN;
    SET LOCAL statement_timeout = '20s';
    INSERT INTO hallo_gps_qa.positions
      (source_id, device_key, truck_id, fix_time, received_at, latitude, longitude, speed_kmh, heading, ignition)
    SELECT source_id, device_key, truck_id, fix_time, received_at, latitude, longitude, speed_kmh, heading, ignition
    FROM jsonb_to_recordset(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb) AS p(
      source_id bigint, device_key text, truck_id text, fix_time timestamptz, received_at timestamptz,
      latitude double precision, longitude double precision, speed_kmh double precision,
      heading double precision, ignition boolean
    )
    ON CONFLICT DO NOTHING;
    COMMIT;
  `;
}

export function writeToStaging(connection, points) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "--no-password", "-q", "-v", "ON_ERROR_STOP=1"], {
      env: connection, stdio: ["pipe", "ignore", "ignore"], timeout: 35_000,
    });
    const failure = () => reject(new Error("Staging PostgreSQL write failed"));
    child.once("error", failure);
    child.once("close", (code) => code === 0 ? resolve() : failure());
    child.stdin.once("error", failure);
    child.stdin.end(insertBatchSql(points));
  });
}

export async function replicatePositions({ store, mappings, writeBatch }) {
  let after = 0;
  let submitted = 0;
  for (;;) {
    const batch = store.exportBatch(mappings, after, BATCH_SIZE);
    if (!batch.length) return submitted;
    await writeBatch(batch.map(({ ledger_id, ...point }) => point));
    after = batch.at(-1).ledger_id;
    submitted += batch.length;
  }
}
