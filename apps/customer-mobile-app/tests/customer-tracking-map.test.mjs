import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapSource = readFileSync(new URL("../src/CustomerTrackingMap.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/CustomerTrackingPage.tsx", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../src/customer-tracking.service.ts", import.meta.url), "utf8");
const freshnessSource = readFileSync(new URL("../src/tracking-freshness.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Customer Track renders MapLibre from existing live-trip coordinates", () => {
  assert.equal(typeof packageJson.dependencies["maplibre-gl"], "string");
  assert.match(mapSource, /new maplibregl\.Map\(/);
  for (const key of ["pickup_lng","pickup_lat","dropoff_lng","dropoff_lat","truck_lng","truck_lat"]) assert.match(mapSource, new RegExp(`trip\\.${key}`));
});

test("map includes pickup drop-off truck markers, auto-fit, controls and pinch zoom", () => {
  assert.match(mapSource, /setMarker\([\s\S]*?"pickup"/);
  assert.match(mapSource, /setMarker\([\s\S]*?"dropoff"/);
  assert.match(mapSource, /setMarker\([\s\S]*?"truck"/);
  assert.match(mapSource, /map\.fitBounds\(/);
  assert.match(mapSource, /NavigationControl/);
  assert.match(mapSource, /touchZoomRotate: true/);
  assert.doesNotMatch(mapSource, /touchZoomRotate\.disable/);
});

test("route polyline and live remaining ETA reuse the root portal OSRM route service", () => {
  assert.match(mapSource, /router\.project-osrm\.org\/route\/v1\/driving/);
  assert.match(mapSource, /ROUTE_SOURCE_ID/);
  assert.match(mapSource, /LineString/);
  assert.match(mapSource, /remaining\.durationS/);
  assert.match(mapSource, /Remaining distance/);
  assert.match(mapSource, /ETA/);
});

test("progress maps Assigned Pickup On route Delivered", () => {
  assert.match(mapSource, /\["Assigned", "Pickup", "On route", "Delivered"\]/);
  assert.match(mapSource, /status === "delivered"/);
  assert.match(mapSource, /status === "in_transit"/);
});

test("freshness contract preserves LIVE STALE OFFLINE and exact timestamp", () => {
  assert.match(freshnessSource, /TrackingFreshness = "LIVE" \| "STALE" \| "OFFLINE"/);
  assert.match(freshnessSource, /TRACKING_LIVE_MAX_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(freshnessSource, /TRACKING_OFFLINE_AFTER_MS = 30 \* 60 \* 1000/);
  assert.match(mapSource, /classifyTrackingFreshness\(hasTruck \? trip\?\.recorded_at : null\)/);
  assert.match(mapSource, /"GPS STALE"/);
  assert.match(mapSource, /"GPS OFFLINE"/);
  assert.match(mapSource, /Waiting for GPS/);
  assert.match(mapSource, /last known location, not a current\/live position/);
  assert.match(mapSource, /second: "2-digit"/);
  assert.match(mapSource, /timeZoneName: "short"/);
});

test("tracking remains Customer-owned and mutation-free", () => {
  assert.match(serviceSource, /auth\.user\.id !== userId/);
  assert.match(serviceSource, /\.eq\("customer_id", userId\)/);
  assert.match(serviceSource, /allowedOrderIds\.has\(row\.order_id\)/);
  const combined = `${mapSource}\n${pageSource}\n${serviceSource}`;
  assert.doesNotMatch(combined, /\.insert\(/);
  assert.doesNotMatch(combined, /\.update\(/);
  assert.doesNotMatch(combined, /\.delete\(/);
  assert.doesNotMatch(combined, /service_role/i);
});
