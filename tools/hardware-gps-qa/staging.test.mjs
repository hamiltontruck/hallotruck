import test from "node:test";
import assert from "node:assert/strict";
import { stagingConnection, stagingPoolerTarget, replicatePositions } from "./staging/replicate.mjs";

const ref = "rmnjhdlbhfcmlvzqtblm";
const host = "aws-1-eu-central-1.pooler.supabase.com";
const user = `hallo_gps_qa_ingest.${ref}`;
const config = {
  HALLO_GPS_ENV: "qa", HALLO_GPS_STAGING_PROJECT_REF: ref,
  PGHOST: host, PGPORT: "5432", PGUSER: user, PGPASSWORD: "fixture",
};

test("staging only accepts the pinned QA Session Pooler target and role", () => {
  assert.deepEqual(stagingPoolerTarget(), {
    HALLO_GPS_STAGING_PROJECT_REF: ref, PGHOST: host, PGPORT: "5432", PGUSER: user,
  });
  for (const override of [
    { HALLO_GPS_ENV: "production" },
    { HALLO_GPS_STAGING_PROJECT_REF: "febgayjolfrooaqenlje" },
    { HALLO_GPS_STAGING_PROJECT_REF: "abcdefghijklmnopqrst" },
    { PGHOST: "aws-0-eu-central-1.pooler.supabase.com" },
    { PGHOST: `db.${ref}.supabase.co` },
    { PGHOST: `${host}.example.com` },
    { PGPORT: "6543" },
    { PGUSER: "hallo_gps_qa_ingest" },
    { PGUSER: `postgres.${ref}` },
    { PGUSER: "hallo_gps_qa_ingest.febgayjolfrooaqenlje" },
    { PGPASSWORD: "" },
  ]) assert.throws(() => stagingConnection({ ...config, ...override }), /Confirmed staging project/);
});

test("the connection guard ignores libpq routing overrides and enforces verified TLS", () => {
  const connection = stagingConnection({
    ...config, PGSSLMODE: "disable", PGSSLROOTCERT: "/tmp/untrusted.pem",
    PGHOSTADDR: "192.0.2.1", PGSERVICE: "untrusted", PGOPTIONS: "untrusted",
  });
  assert.equal(connection.PGHOST, host);
  assert.equal(connection.PGPORT, "5432");
  assert.equal(connection.PGSSLMODE, "verify-full");
  assert.equal(connection.PGSSLROOTCERT, "system");
  for (const name of ["PGHOSTADDR", "PGSERVICE", "PGOPTIONS"]) assert.equal(connection[name], undefined);
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
