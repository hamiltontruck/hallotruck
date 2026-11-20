import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { openPositionStore, syncPositions } from "../position-store.mjs";
import { insertBatchSql, replicatePositions } from "./replicate.mjs";

const executorSession = `
  SET SESSION AUTHORIZATION gps_qa_executor;
  SET createrole_self_grant = '';
`;

const snapshotSql = `
  SELECT jsonb_build_object(
    'roles', (SELECT jsonb_object_agg(rolname, rolcanlogin) FROM pg_roles
      WHERE rolname IN ('hallo_gps_qa_writer', 'hallo_gps_qa_ingest', 'hallo_gps_qa_test_outsider')),
    'memberships', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid, m.member, m.grantor)
      FROM pg_auth_members AS m JOIN pg_roles AS r ON r.oid = m.roleid
      WHERE r.rolname IN ('hallo_gps_qa_writer', 'hallo_gps_qa_ingest', 'hallo_gps_qa_test_outsider')),
    'mappings', (SELECT count(*) FROM hallo_gps_qa.device_mapping),
    'positions', (SELECT count(*) FROM hallo_gps_qa.positions)
  );
`;

export async function testStagingPermissions(execute) {
  const readSql = (name) => readFile(new URL(`./${name}.sql`, import.meta.url), "utf8");
  await execute(`
    CREATE ROLE gps_qa_executor NOLOGIN CREATEROLE;
    DO $$ BEGIN
      EXECUTE format('GRANT CREATE ON DATABASE %I TO gps_qa_executor', current_database());
    END $$;
  `);
  const [install, prepare, test] = await Promise.all(
    ["install", "prepare-writer", "test"].map(readSql),
  );
  await execute(executorSession + install + install + prepare + prepare);
  const baseline = await execute(executorSession + `
    SELECT jsonb_build_object(
      'superuser', (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
      'admin', (SELECT admin_option FROM pg_auth_members
        WHERE roleid = 'hallo_gps_qa_ingest'::regrole AND member = current_user::regrole),
      'canSet', pg_has_role(current_user, 'hallo_gps_qa_ingest', 'SET')
    );
  `);
  assert.deepEqual(JSON.parse(baseline), { superuser: false, admin: true, canSet: false });
  const before = JSON.parse(await execute(snapshotSql));
  assert.deepEqual(before.roles, { hallo_gps_qa_writer: false, hallo_gps_qa_ingest: false });
  assert.equal(before.mappings, 0);
  assert.equal(before.positions, 0);

  await execute(executorSession + test);

  const after = JSON.parse(await execute(snapshotSql));
  assert.deepEqual(after, before, "rollback must preserve memberships, LOGIN flags and QA row counts");
}

export async function testStagingTransport(execute) {
  const mapping = { uniqueId: "0098765432", name: "Synthetic", truckId: "qa-integrated-truck" };
  const now = Date.parse("2026-11-20T12:00:00Z");
  const base = { deviceId: 18, protocol: "h02", valid: true, latitude: 9, longitude: 38 };
  const fresh = { ...base, id: 100, fixTime: "2026-11-20T11:59:50.000Z" };
  const replay = { ...base, id: 101, fixTime: "2026-11-20T11:55:00.000Z" };
  const store = openPositionStore(":memory:");
  const writer = (rows) => execute(`SET ROLE hallo_gps_qa_ingest; ${insertBatchSql(rows)} RESET ROLE;`);
  const poll = (history) => syncPositions({
    api: { devices: async () => [{ id: base.deviceId, uniqueId: mapping.uniqueId }], history: async () => history },
    store, mappings: [mapping], now,
  });
  const send = () => replicatePositions({ store, mappings: [mapping], writeBatch: writer });
  try {
    await execute("INSERT INTO hallo_gps_qa.device_mapping VALUES ('0098765432', 'qa-integrated-truck');");
    await poll([fresh]);
    assert.equal(await send(), 1);
    await poll([fresh, replay, { ...fresh, id: 103 }]);
    assert.equal(await send(), 2);
    assert.equal(await send(), 2);
    await execute(`
      DO $$ BEGIN
        IF (SELECT count(*) FROM hallo_gps_qa.positions) <> 2
        OR NOT EXISTS (SELECT 1 FROM hallo_gps_qa.positions WHERE source_id = 101
          AND device_key = '0098765432' AND truck_id = 'qa-integrated-truck'
          AND fix_time = '2026-11-20 11:55:00+00' AND received_at = '2026-11-20 12:00:00+00')
        THEN RAISE EXCEPTION 'Expected two distinct fixes with original timestamps'; END IF;
      END $$;
    `);
  } finally {
    store.close();
  }
}

if (process.env.PG_CONTAINER) {
  const execute = (sql) => execFileSync("docker", [
    "exec", "-i", process.env.PG_CONTAINER, "psql", "-XAtq", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
  await testStagingPermissions(execute);
  console.log("Non-superuser permission assertions and rollback state PASS");
  await testStagingTransport(execute);
  console.log("SQLite to PostgreSQL telemetry, mapping, timestamps, and replay PASS");
}
