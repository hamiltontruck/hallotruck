import test from "node:test";
import assert from "node:assert/strict";
import { readHalloTruckLocation } from "./hallo-bridge.mjs";
const now = Date.parse("2026-11-01T12:00:00.000Z");
const truck = { id: "truck-1", plate_number: "QA-123", gps_provider: "traccar", gps_external_id: "test-device-id" };
function client(point) { return { latestAuthorized: async () => point }; }
function point(ms=now) { return { truck_id: truck.id, device_unique_id: truck.gps_external_id, source: "traccar", latitude: 9.01, longitude: 38.76, speed_kmh: 23, heading: 90, fix_time: new Date(ms).toISOString() }; }
test("valid authorized API response formats HALLO LIVE truck view", async () => {
  const result = await readHalloTruckLocation({ client: client(point()), truck, now });
  assert.equal(result.status, "LIVE"); assert.equal(result.plate_number, "QA-123"); assert.equal(result.location.latitude, 9.01);
});
test("age determines STALE and OFFLINE; no fix is OFFLINE", async () => {
  assert.equal((await readHalloTruckLocation({ client: client(point(now-120000)), truck, now })).status, "STALE");
  assert.equal((await readHalloTruckLocation({ client: client(point(now-1200000)), truck, now })).status, "OFFLINE");
  assert.equal((await readHalloTruckLocation({ client: client(null), truck, now })).location, null);
});
test("rejects forged device-to-truck mapping", async () => {
  await assert.rejects(readHalloTruckLocation({ client: client({...point(), truck_id:"other"}), truck, now }), /mapping mismatch/);
  await assert.rejects(readHalloTruckLocation({ client: client(point()), truck:{...truck,gps_provider:"other"},now }), /Approved/);
});
test("rejects invalid telemetry and future timestamps", async () => {
  await assert.rejects(readHalloTruckLocation({ client: client({...point(),latitude:999}), truck, now }), /coordinates/);
  await assert.rejects(readHalloTruckLocation({ client: client(point(now+360000)), truck, now }), /timestamp/);
});
