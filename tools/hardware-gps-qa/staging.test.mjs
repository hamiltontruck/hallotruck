import test from "node:test";
import assert from "node:assert/strict";
import { stagingConnection, stagingPoolerTarget, replicatePositions } from "./staging/replicate.mjs";

const ref = "rmnjhdlbhfcmlvzqtblm";
const config = {
  HALLO_GPS_ENV: "qa", HALLO_GPS_STAGING_PROJECT_REF: ref,
  PGHOST: `db.${ref}.supabase.co`, PGUSER: "hallo_gps_qa_ingest", PGPASSWORD: "fixture",
};

test("staging connections stay closed until the exact QA pooler host is confirmed", () => {
  assert.throws(() => stagingPoolerTarget(), /hostname has not been confirmed/);
  for (const input of [
    config,
    { ...config, PGHOST: "aws-0-eu-central-1.pooler.supabase.com", PGPORT: "5432", PGUSER: `hallo_gps_qa_ingest.${ref}` },
    { ...config, HALLO_GPS_STAGING_PROJECT_REF: "febgayjolfrooaqenlje" },
  ]) assert.throws(() => stagingConnection(input), /hostname has not been confirmed/);
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
