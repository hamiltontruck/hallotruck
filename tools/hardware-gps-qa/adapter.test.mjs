import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTraccarPosition } from "./traccar-adapter.mjs";
import { fakeDevices, fakeMappings, simulatedPosition } from "./simulator.mjs";
const now = new Date("2026-11-01T10:00:30.000Z");
const convert = (p, mappings=fakeMappings) => normalizeTraccarPosition(p, fakeDevices, mappings, now);
test("normalizes location, speed from knots, heading and ignition", () => {
  const point = convert(simulatedPosition());
  assert.equal(point.truck_id, "qa-truck-001");
  assert.equal(point.speed_kmh, 37.04);
  assert.equal(point.ignition, true);
  assert.equal(point.freshness, "LIVE");
  assert.equal(point.source, "hardware");
  assert.equal(point.order_id, undefined);
});
test("stale and offline positions are not represented as live", () => {
  assert.equal(convert(simulatedPosition({time:new Date("2026-11-01T09:58:00.000Z")})).freshness,"STALE");
  assert.equal(convert(simulatedPosition({time:new Date("2026-11-01T09:53:00.000Z")})).freshness,"OFFLINE");
});
test("rejects unknown device and missing or duplicate mappings", () => {
  assert.throws(() => convert(simulatedPosition({deviceId:1000})), /unknown_device/);
  assert.throws(() => convert(simulatedPosition(), []), /invalid_truck_mapping/);
  assert.throws(() => convert(simulatedPosition(), [...fakeMappings,...fakeMappings]), /invalid_truck_mapping/);
});
test("rejects impossible coordinates and speed", () => {
  assert.throws(() => convert(simulatedPosition({lat: 100})), /invalid_coordinates/);
  assert.throws(() => convert(simulatedPosition({knots: 300})), /invalid_speed/);
});
test("rejects replay beyond 24 hours and future drift", () => {
  assert.throws(() => convert(simulatedPosition({time:new Date("2026-10-30T10:00:00.000Z")})), /timestamp_out_of_range/);
  assert.throws(() => convert(simulatedPosition({time:new Date("2026-11-01T10:07:00.000Z")})), /timestamp_out_of_range/);
});
