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
  assert.match(mapSource, /trip\.pickup_lng/);
  assert.match(mapSource, /trip\.pickup_lat/);
  assert.match(mapSource, /trip\.dropoff_lng/);
  assert.match(mapSource, /trip\.dropoff_lat/);
  assert.match(mapSource, /trip\.truck_lng/);
  assert.match(mapSource, /trip\.truck_lat/);
});

test("real map includes pickup, drop-off and truck markers and auto-fits visible points", () => {
  assert.match(mapSource, /setMarker\([\s\S]*?"pickup"/);
  assert.match(mapSource, /setMarker\([\s\S]*?"dropoff"/);
  assert.match(mapSource, /setMarker\([\s\S]*?"truck"/);
  assert.match(mapSource, /map\.fitBounds\(/);
  assert.match(mapSource, /data-truck-arrow/);
});

test("Customer Tracking page passes the secured live-trip snapshot directly to the real map", () => {
  assert.match(pageSource, /import \{ CustomerTrackingMap \} from "\.\/CustomerTrackingMap"/);
  assert.match(pageSource, /<CustomerTrackingMap trip=\{trip\} \/>/);
  assert.match(serviceSource, /\.rpc\("customer_get_live_trip", \{ p_order_id: order\.id \}\)/);
});

test("customer mobile freshness contract uses LIVE, STALE and OFFLINE thresholds", () => {
  assert.match(freshnessSource, /TrackingFreshness = "LIVE" \| "STALE" \| "OFFLINE"/);
  assert.match(freshnessSource, /TRACKING_LIVE_MAX_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(freshnessSource, /TRACKING_OFFLINE_AFTER_MS = 30 \* 60 \* 1000/);
  assert.match(freshnessSource, /ageMs <= TRACKING_LIVE_MAX_AGE_MS\) return "LIVE"/);
  assert.match(freshnessSource, /ageMs <= TRACKING_OFFLINE_AFTER_MS\) return "STALE"/);
  assert.match(freshnessSource, /return "OFFLINE"/);
});

test("stale or offline coordinates are never labeled as current/live", () => {
  assert.match(mapSource, /classifyTrackingFreshness\(hasTruck \? trip\?\.recorded_at : null\)/);
  assert.match(mapSource, /"GPS LIVE"/);
  assert.match(mapSource, /"GPS STALE"/);
  assert.match(mapSource, /"GPS OFFLINE"/);
  assert.doesNotMatch(mapSource, /hasTruck \? "GPS LIVE"/);
  assert.match(mapSource, /last known location, not a current\/live position/);
  assert.match(pageSource, /gpsLive = hasGps && freshness === "LIVE"/);
  assert.match(pageSource, /STALE or OFFLINE coordinates are historical last-known data, never a current\/live position/);
});

test("tracking snapshot shows the exact last-update timestamp", () => {
  assert.match(pageSource, /Last GPS update/);
  assert.match(pageSource, /second: "2-digit"/);
  assert.match(pageSource, /timeZoneName: "short"/);
  assert.match(pageSource, /formatRecordedAt\(trip\?\.recorded_at\)/);
});

test("tracking freshness UI preserves customer authorization isolation", () => {
  assert.match(serviceSource, /client\.auth\.getUser\(\)/);
  assert.match(serviceSource, /auth\.user\.id !== userId/);
  assert.match(serviceSource, /\.eq\("customer_id", userId\)/);
  assert.match(serviceSource, /allowedOrderIds\.has\(assignment\.order_id\)/);
  assert.match(serviceSource, /row\.order_id !== order\.id/);
  assert.match(serviceSource, /Customer live-trip ownership mismatch/);
});

test("map-only slice does not add booking, order, payment or tracking mutations", () => {
  const combined = `${mapSource}\n${pageSource}`;
  assert.doesNotMatch(combined, /\.insert\(/);
  assert.doesNotMatch(combined, /\.update\(/);
  assert.doesNotMatch(combined, /\.delete\(/);
  assert.doesNotMatch(combined, /customer_submit_payment/);
  assert.doesNotMatch(combined, /customer_create|create_order|submit_order/i);
  assert.doesNotMatch(combined, /router\.project-osrm|Estimated ETA|remainingSeconds/);
});
