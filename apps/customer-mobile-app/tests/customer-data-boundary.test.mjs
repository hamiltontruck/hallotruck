import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/customer-data.service.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("orders are explicitly scoped to the verified Customer user id", () => {
  assert.match(service, /auth\.getUser\(\)/);
  assert.match(service, /auth\.user\.id !== userId/);
  assert.match(service, /\.from\("orders"\)[\s\S]*?\.eq\("customer_id", userId\)/);
});

test("profile uses the existing secure Customer profile RPC", () => {
  assert.match(service, /\.rpc\("customer_get_profile"\)/);
  assert.match(service, /profile\.id !== userId/);
});

test("verified Customer identity is passed to standalone Orders and Profile pages", () => {
  assert.match(main, /\(identity\) => <App identity=\{identity\} \/>/);
  assert.match(app, /<CustomerOrdersPage userId=\{identity\.userId\}/);
  assert.match(app, /<CustomerProfilePage userId=\{identity\.userId\}/);
});

test("Customer data service keeps direct table writes blocked and allows only the guarded cancellation RPC", () => {
  assert.doesNotMatch(service, /\.insert\(/);
  assert.doesNotMatch(service, /\.update\(/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /customer_update_profile/);

  assert.match(service, /export async function cancelCustomerMobileOrder\(userId: string, orderId: string, reason: string\)/);
  assert.match(service, /const client = await requireCustomerSession\(userId\);[\s\S]*?client\.rpc\("customer_cancel_order", \{/);
  assert.match(service, /p_order_id: orderId/);
  assert.match(service, /p_reason: cleanReason/);
});
