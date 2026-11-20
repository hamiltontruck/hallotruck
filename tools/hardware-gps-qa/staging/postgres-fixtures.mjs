import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { openPositionStore, syncPositions } from "../position-store.mjs";
import { insertBatchSql, replicatePositions } from "./replicate.mjs";

export async function testStagingTransport(execute) {
  const mapping = { uniqueId: "0098765432", name: "Synthetic", truckId: "qa-integrated-truck" };
  const now = Date.parse("2026-11-20T12:00:00Z");
  const base = { deviceId: 18, protocol: "h02", valid: true, latitude: 9, longitude: 38 };
  const fresh = { ...base, id: 100, fixTime: "2026-11-20T11:59:50.000Z" };
  const replay = { ...base, id: 101, fixTime: "2026-11-20T11:55:00.000Z" };
  const store = openPositionStore(":memory:");
  const writer = (rows) => execute(`SET ROLE hallo_gps_qa_writer; ${insertBatchSql(rows)} RESET ROLE;`);
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
  await testStagingTransport((sql) => execFileSync("docker", [
    "exec", "-i", process.env.PG_CONTAINER, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, stdio: ["pipe", "ignore", "inherit"] }));
  console.log("SQLite to PostgreSQL telemetry, mapping, timestamps, and replay PASS");
}
