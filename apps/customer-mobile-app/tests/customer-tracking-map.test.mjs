import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapSource = readFileSync(new URL("../src/CustomerTrackingMap.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/CustomerTrackingPage.tsx", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../src/customer-tracking.service.ts", import.meta.url), "utf8");
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

test("map-only slice does not add booking, order, payment or tracking mutations", () => {
  const combined = `${mapSource}\n${pageSource}`;
  assert.doesNotMatch(combined, /\.insert\(/);
  assert.doesNotMatch(combined, /\.update\(/);
  assert.doesNotMatch(combined, /\.delete\(/);
  assert.doesNotMatch(combined, /customer_submit_payment/);
  assert.doesNotMatch(combined, /customer_create|create_order|submit_order/i);
  assert.doesNotMatch(combined, /router\.project-osrm|Estimated ETA|remainingSeconds/);
});
