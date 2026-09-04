import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/customer-tracking.service.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/CustomerTrackingPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("tracking orders are explicitly scoped to the verified Customer", () => {
  assert.match(service, /auth\.getUser\(\)/);
  assert.match(service, /auth\.user\.id !== userId/);
  assert.match(service, /\.from\("orders"\)[\s\S]*?\.eq\("customer_id", userId\)[\s\S]*?\.in\("status", ACTIVE_TRACKING_STATUSES\)/);
});

test("assignment cards are filtered back to the Customer active order ids", () => {
  assert.match(service, /\.rpc\("customer_driver_assignment_cards"\)/);
  assert.match(service, /allowedOrderIds = new Set\(orderIds\)/);
  assert.match(service, /\.filter\(\(assignment\) => allowedOrderIds\.has\(assignment\.order_id\)\)/);
});

test("live GPS uses the secured live-trip RPC and validates returned order id", () => {
  assert.match(service, /\.rpc\("customer_get_live_trip", \{ p_order_id: order\.id \}\)/);
  assert.match(service, /row\.order_id !== order\.id/);
  assert.match(page, /LIVE GPS SNAPSHOT/);
  assert.match(page, /8000/);
});

test("Track tab receives verified Customer identity", () => {
  assert.match(app, /import \{ CustomerTrackingPage \} from "\.\/CustomerTrackingPage"/);
  assert.match(app, /tab === "track"/);
  assert.match(app, /<CustomerTrackingPage userId=\{identity\.userId\}/);
});

test("tracking slice is read-only and does not invent ETA", () => {
  assert.doesNotMatch(service, /\.insert\(/);
  assert.doesNotMatch(service, /\.update\(/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /service_role/i);
  assert.match(page, /ETA and route are not invented here/);
});
