import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/customer-data.service.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const paymentsPage = readFileSync(new URL("../src/CustomerPaymentsPage.tsx", import.meta.url), "utf8");

test("payments are loaded only after Customer-scoped order ids are resolved", () => {
  assert.match(service, /\.from\("orders"\)[\s\S]*?\.eq\("customer_id", userId\)/);
  assert.match(service, /const orderIds = orders\.map\(\(order\) => order\.id\)/);
  assert.match(service, /\.from\("payments"\)[\s\S]*?\.in\("order_id", orderIds\)/);
});

test("Payments tab receives the verified Customer identity", () => {
  assert.match(app, /import \{ CustomerPaymentsPage \} from "\.\/CustomerPaymentsPage"/);
  assert.match(app, /tab === "payments"/);
  assert.match(app, /<CustomerPaymentsPage userId=\{identity\.userId\}/);
});

test("payment history is read-only and receipt access uses a short-lived signed URL", () => {
  assert.match(service, /\.from\("payment-receipts"\)[\s\S]*?\.createSignedUrl\(cleanPath, 300\)/);
  assert.doesNotMatch(service, /\.insert\(/);
  assert.doesNotMatch(service, /\.update\(/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /\.upsert\(/);
  assert.doesNotMatch(service, /\.upload\(/);
  assert.doesNotMatch(service, /\.remove\(/);
  assert.doesNotMatch(service, /customer_submit_payment/);
});

test("Payments UI does not invent verified balance calculations", () => {
  assert.match(paymentsPage, /Events and amounts are shown exactly as recorded in the database ledger/);
  assert.doesNotMatch(paymentsPage, /verifiedPaid|balanceToPay|releasedGross|heldEscrow/);
});
