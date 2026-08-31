import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatRouteDistance,
  formatRouteDuration,
  normalizeDriverActiveTripOrder,
  normalizeDriverNavigationRoute,
  projectRouteToSvg,
} from "../.test-dist-active/driver-active-trip.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-active-trip.service.ts", import.meta.url), "utf8");
const queueSource = readFileSync(new URL("../src/driver/driver-gps-queue.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../src/driver/DriverActiveTripView.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("normalizes only assigned active lifecycle rows", () => {
  const accepted = normalizeDriverActiveTripOrder({
    id: "order-1",
    tracking_id: "HT-2026-1",
    status: "accepted",
    pickup_address: "Adama",
    dropoff_address: "Finfinnee",
    price_etb: "12000",
    accepted_at: null,
    selected_payment_method: "cash",
  });
  assert.equal(accepted?.status, "accepted");
  assert.equal(accepted?.priceEtb, 12000);
  assert.equal(accepted?.selectedPaymentMethod, "cash");
  assert.equal(normalizeDriverActiveTripOrder({ ...accepted, status: "delivered" }), null);
  assert.equal(normalizeDriverActiveTripOrder({ id: "missing-fields", status: "in_transit" }), null);
});

test("normalizes server route geometry and rejects malformed payloads", () => {
  const route = normalizeDriverNavigationRoute({
    geometry: {
      type: "LineString",
      coordinates: [[38.7, 9.0], [39.1, 8.8], [39.4, 8.6]],
    },
    distanceKm: 95.4,
    durationMin: 122,
    steps: [{ instruction: "Continue straight", distanceM: 420, durationSec: 36, location: [38.7, 9.0] }],
  });
  assert.equal(route?.coordinates.length, 3);
  assert.equal(route?.steps[0].instruction, "Continue straight");
  assert.equal(normalizeDriverNavigationRoute({ geometry: { type: "Point", coordinates: [1, 2] } }), null);
});

test("projects real route points into a finite SVG path", () => {
  const projected = projectRouteToSvg([[38.7, 9.0], [39.1, 8.8], [39.4, 8.6]], [39.0, 8.85]);
  assert.ok(projected?.path.startsWith("M"));
  assert.ok(projected?.path.includes("L"));
  assert.ok(projected?.driver);
  assert.equal(projectRouteToSvg([[1, 2]], null), null);
});

test("formats unknown route metrics without false zero", () => {
  assert.equal(formatRouteDistance(null), "—");
  assert.equal(formatRouteDuration(null), "—");
  assert.equal(formatRouteDistance(95.44), "95.4 km");
  assert.equal(formatRouteDuration(125), "2h 5m");
});

test("service preserves assigned-driver and server-confirmed boundaries", () => {
  assert.match(serviceSource, /\.eq\("driver_id", user\.id\)/);
  assert.match(serviceSource, /\/navigation\?orderId=/);
  assert.match(serviceSource, /\/tracking/);
  assert.match(serviceSource, /fetchDriverAssignedTrip\(expectedUserId, ping\.orderId\)/);
  assert.doesNotMatch(serviceSource, /user_metadata|app_metadata/);
});

test("offline GPS queue is isolated and capped", () => {
  assert.match(queueSource, /hallo-mobile-driver-gps-v1/);
  assert.match(queueSource, /MAX_SCOPE_PINGS = 20/);
  assert.match(queueSource, /userId === userId && ping\.orderId === orderId/);
  assert.match(queueSource, /throw error/);
});

test("active trip component guards GPS lifecycle and stale assignment", () => {
  assert.match(componentSource, /navigator\.geolocation\.watchPosition/);
  assert.match(componentSource, /MIN_PING_INTERVAL_MS = 15_000/);
  assert.match(componentSource, /enqueueDriverPing/);
  assert.match(componentSource, /syncQueuedDriverPings/);
  assert.match(componentSource, /clearQueuedDriverPings\(userId, previous\.id\)/);
  assert.match(componentSource, /confirmed\.status === "in_transit"/);
});

test("App routes Driver map to the real active trip component", () => {
  assert.match(appSource, /DriverActiveTripView/);
  assert.match(appSource, /role === "driver"/);
  assert.match(appSource, /CustomerLiveMapView/);
});
