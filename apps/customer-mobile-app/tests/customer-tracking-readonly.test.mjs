import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/customer-tracking.service.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/CustomerTrackingPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("tracking orders are explicitly scoped to the verified Customer", () => {
  assert.match(service, /auth\.getUser\(\)/);
  assert.match(service, /auth\.user\.id !== userId/);
  assert.match(service, /\.from\("orders"\)[\s\S]*?\.eq\("customer_id", userId\)/);
  assert.match(service, /ownedOrders\.filter\(\(order\) => order\.id === preferredOrderId/);
});

test("assignment cards are filtered back to Customer-owned tracking order ids", () => {
  assert.match(service, /loadCustomerAssignments\(userId, orderIds\)/);
  assert.match(service, /allowedOrderIds = new Set\(orderIds\)/);
  assert.match(service, /allowedOrderIds\.has\(assignment\.order_id\)/);
});

test("live GPS uses the secured live-trip RPC and ownership mismatch guard", () => {
  assert.match(service, /\.rpc\("customer_get_live_trip", \{ p_order_id: order\.id \}\)/);
  assert.match(service, /row\.order_id !== order\.id/);
  assert.match(service, /Customer live-trip ownership mismatch/);
});

test("tracking subscriptions are lifecycle safe and use scoped realtime sources", () => {
  assert.match(service, /client\.channel\(`customer-mobile-trip:\$\{userId\}:\$\{orderId\}`\)/);
  assert.match(service, /table: "tracking_pings", filter: `order_id=eq\.\$\{orderId\}`/);
  assert.match(service, /table: "delivery_proofs", filter: `order_id=eq\.\$\{orderId\}`/);
  assert.match(service, /void client\.removeChannel\(channel\)/);
  assert.doesNotMatch(page, /setInterval/);
  assert.match(page, /cleanup\?\.\(\)/);
});

test("Track tab receives verified Customer identity and can open one owned order", () => {
  assert.match(app, /import \{ CustomerTrackingPage \} from "\.\/CustomerTrackingPage"/);
  assert.match(app, /trackingOrderId/);
  assert.match(app, /onTrackOrder=\{openTracking\}/);
  assert.match(app, /<CustomerTrackingPage userId=\{identity\.userId\} initialOrderId=\{trackingOrderId\}/);
});

test("tracking slice is read-only for Customer GPS", () => {
  assert.doesNotMatch(service, /\.insert\(/);
  assert.doesNotMatch(service, /\.update\(/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /service_role/i);
  assert.match(page, /GPS writes remain Driver-only/);
});
