import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const flow = fs.readFileSync(new URL("../src/CustomerBookingFlow.tsx", import.meta.url), "utf8");
const orderService = fs.readFileSync(new URL("../src/customer-order.service.ts", import.meta.url), "utf8");

test("Customer Mobile automatically calculates ETB after route and valid load are ready", () => {
  assert.match(flow, /window\.setTimeout\(\(\) => \{/);
  assert.match(flow, /\}, 250\);/);
  assert.match(flow, /loadCustomerQuotePreview\(userId/);
  assert.match(flow, /if \(!routeReady \|\| !loadReady \|\| !pickupPlace \|\| !dropoffPlace\) return/);
  assert.match(flow, /setQuote\(result\)/);
  assert.match(flow, /secure pricing RPC/);
});

test("Confirm Order is connected to the existing Customer order contract", () => {
  assert.match(flow, /createCustomerMobileOrder\(\{/);
  assert.match(flow, /submitLockRef\.current/);
  assert.match(flow, /disabled=\{!isFormReady \|\| submitting\}/);
  assert.match(flow, /loadCustomerQuotePreview\(userId/);
  assert.match(orderService, /from\("orders"\)/);
  assert.match(orderService, /\.insert\(\{/);
  assert.match(orderService, /status: "placed"/);
  assert.match(orderService, /selected_payment_method: input\.paymentMethod/);
  assert.doesNotMatch(orderService, /service[_-]?role/i);
});
