import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const activeTrip = source("src/pages/ActiveTrip.tsx");
const gpsControl = source("src/components/driver/DriverActiveTripGpsControl.tsx");
const offlineService = source("src/services/offline.service.ts");
const browserSmoke = source("scripts/driver-active-trip-gps-e2e-smoke.mjs");

test("offline GPS delivery distinguishes queued positions from server-confirmed pings", () => {
  assert.match(offlineService, /export type GpsPingDeliveryResult = "sent" \| "queued"/);
  assert.match(offlineService, /await sendGpsPing\(params\);\s+return "sent"/);
  assert.match(offlineService, /savePendingPings[\s\S]*return "queued"/);
  assert.match(offlineService, /A queued position is not a server-confirmed trip transition/);
  assert.match(offlineService, /throw error; \/\/ authorization, assignment and lifecycle failures must remain visible/);
});

test("pending GPS updates reconnect explicitly and preserve real API failures", () => {
  assert.match(offlineService, /export interface PendingPingSyncResult/);
  assert.match(offlineService, /syncedOrderIds: string\[\]/);
  assert.match(offlineService, /getPendingPingCountForOrder/);
  assert.match(offlineService, /if \(isNetworkFailure\(error\)\)/);
  assert.match(offlineService, /savePendingPings\(\[\.\.\.stillPending, ping, \.\.\.pending\.slice\(index \+ 1\)\]\)/);
  assert.match(gpsControl, /window\.addEventListener\("online", handleOnline\)/);
  assert.match(gpsControl, /result\.syncedOrderIds\.includes\(order\.id\)/);
  assert.match(gpsControl, /await services\.getMyAssignedOrder\(order\.id\)/);
});

test("Active Trip uses one guarded GPS workflow instead of duplicate Start Trip controls", () => {
  assert.match(activeTrip, /<DriverActiveTripGpsControl/);
  assert.doesNotMatch(activeTrip, /function startSharing\(\)/);
  assert.doesNotMatch(activeTrip, /sendOrQueuePing/);
  assert.match(gpsControl, /if \(startingRef\.current \|\| watchIdRef\.current !== null \|\| syncingRef\.current\) return/);
  assert.match(gpsControl, /if \(pingInFlightRef\.current\) return/);
  assert.match(gpsControl, /data-gps-start-action/);
  assert.match(gpsControl, /data-gps-retry-action/);
});

test("queued GPS does not mark the trip In Transit before server confirmation", () => {
  assert.match(gpsControl, /if \(delivery === "queued"\)[\s\S]*setGpsState\("queued"\)[\s\S]*return/);
  assert.match(gpsControl, /if \(order\.status === "accepted"\) \{\s+onOrderChange\(\{ \.\.\.order, status: "in_transit" \}\)/);
  assert.match(gpsControl, /role="status" aria-live="polite"/);
  assert.match(gpsControl, /role="alert"/);
  assert.match(gpsControl, /aria-busy=\{busy\}/);
  assert.match(activeTrip, /pb-32/);
});

test("active-trip browser smoke covers duplicate start, offline queue, reconnect and mobile overflow", () => {
  assert.match(browserSmoke, /watchCalls/);
  assert.match(browserSmoke, /sendResult = "queued"/);
  assert.match(browserSmoke, /window\.dispatchEvent\(new Event\("online"\)\)/);
  assert.match(browserSmoke, /data-watch-calls="1"/);
  assert.match(browserSmoke, /data-order-before-sync="accepted"/);
  assert.match(browserSmoke, /data-order-after-sync="in_transit"/);
  assert.match(browserSmoke, /\[320, 360, 390, 412, 430, 768\]/);
  assert.match(browserSmoke, /data-overflow="false"/);
});
