import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { telephoneHref } from "../../src/utils/phone";

const root = process.cwd();
const component = readFileSync(path.join(root, "src/components/driver/DriverCustomerContact.tsx"), "utf8");
const service = readFileSync(path.join(root, "src/services/driver-payment.service.ts"), "utf8");
const activeTrip = readFileSync(path.join(root, "src/pages/ActiveTrip.tsx"), "utf8");
const browserSmoke = readFileSync(path.join(root, "scripts/driver-customer-contact-e2e-smoke.mjs"), "utf8");
const packageJson = readFileSync(path.join(root, "package.json"), "utf8");

test("Driver customer contact clears stale order data before every request", () => {
  assert.match(component, /const requestIdRef = useRef\(0\)/);
  assert.match(component, /const loadingRef = useRef\(false\)/);
  assert.match(component, /setContact\(null\);\s*setState\("loading"\)/);
  assert.match(component, /requestId !== requestIdRef\.current/);
  assert.match(component, /return \(\) => \{\s*requestIdRef\.current \+= 1;\s*loadingRef\.current = false/);
});

test("Driver customer contact exposes one guarded retry workflow", () => {
  assert.match(component, /if \(loadingRef\.current\) return/);
  assert.match(component, /onClick=\{\(\) => void load\(\)\}/);
  assert.match(component, /data-contact-state=\{state\}/);
  assert.match(component, /aria-busy=\{state === "loading"\}/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /Retry contact/);
  assert.match(component, /Qunnamtii deebi'ii yaali/);
  assert.match(component, /መገኛውን እንደገና ሞክር/);
});

test("Driver call links accept valid phones and reject misleading values", () => {
  assert.equal(telephoneHref("+251 911-222-333"), "tel:+251911222333");
  assert.equal(telephoneHref("0911 222 333"), "tel:0911222333");
  assert.equal(telephoneHref("N/A"), null);
  assert.equal(telephoneHref("123"), null);
  assert.equal(telephoneHref(null), null);
  assert.match(component, /from "\.\.\/\.\.\/utils\/phone"/);
  assert.match(component, /state === "ready" && callHref/);
  assert.doesNotMatch(component, /href=\{phoneHref\(contact\.customer_phone\)\}/);
});

test("assigned-customer authorization remains database-backed", () => {
  assert.match(service, /rpc\("driver_order_contact"/);
  assert.match(service, /p_order_id: orderId/);
  assert.match(activeTrip, /<DriverCustomerContact orderId=\{order\.id\}/);
  assert.doesNotMatch(component, /profiles|orders|customer_id|user_metadata|app_metadata/);
});

test("browser smoke verifies stale-contact removal, retry locking and mobile safety", () => {
  for (const width of [320, 360, 390, 412, 430, 768]) {
    assert.match(browserSmoke, new RegExp(`\\b${width}\\b`));
  }
  assert.match(browserSmoke, /retryButton\.click\(\);\s*retryButton\.click\(\)/);
  assert.match(browserSmoke, /data-stale-cleared="true"/);
  assert.match(browserSmoke, /data-retry-calls="true"/);
  assert.match(browserSmoke, /data-invalid-link="true"/);
  assert.match(browserSmoke, /data-overflow="false"/);
  assert.match(packageJson, /driver-customer-contact-e2e-smoke\.mjs/);
});
