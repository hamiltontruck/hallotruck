import test from "node:test";
import assert from "node:assert/strict";
import { stagingConnection, replicatePositions } from "./staging/replicate.mjs";

const ref = "abcdefghijklmnopqrst";
const config = {
  HALLO_GPS_ENV: "qa", HALLO_GPS_STAGING_PROJECT_REF: ref,
  PGHOST: `db.${ref}.supabase.co`, PGUSER: "hallo_gps_qa_ingest", PGPASSWORD: "fixture",
};

test("staging connection rejects production, a mismatched host, and privileged credentials", () => {
  assert.equal(stagingConnection(config).PGSSLMODE, "verify-full");
  for (const bad of [
    { HALLO_GPS_ENV: "production" },
    { HALLO_GPS_STAGING_PROJECT_REF: "febgayjolfrooaqenlje", PGHOST: "db.febgayjolfrooaqenlje.supabase.co" },
    { PGHOST: "other.example" }, { PGUSER: "postgres" }, { PGPASSWORD: "" },
  ]) assert.throws(() => stagingConnection({ ...config, ...bad }), /staging/i);
  assert.equal(stagingConnection({ ...config, TRACCAR_TOKEN: "fixture" }).TRACCAR_TOKEN, undefined);
});

test("a failed batch is replayable and receipts remain unchanged", async () => {
  const rows = [{ ledger_id: 1, source_id: 19, received_at: "2026-11-20T12:00:00.000Z" }];
  const store = { exportBatch: (_maps, after) => after === 0 ? rows : [] };
  await assert.rejects(replicatePositions({ store, mappings: [], writeBatch: async () => {
    throw new Error("simulated outage");
  } }), /outage/);
  const captured = [];
  assert.equal(await replicatePositions({ store, mappings: [], writeBatch: async (batch) => captured.push(...batch) }), 1);
  assert.deepEqual(captured, [{ source_id: 19, received_at: rows[0].received_at }]);
});
