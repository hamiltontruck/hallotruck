import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const component = readFileSync(
  path.join(root, "src/components/driver/DriverPaymentConfirmation.tsx"),
  "utf8",
);
const service = readFileSync(
  path.join(root, "src/services/driver-payment.service.ts"),
  "utf8",
);
const browserSmoke = readFileSync(
  path.join(root, "scripts/trip-completion-e2e-smoke.mjs"),
  "utf8",
);

test("Driver payment confirmation blocks duplicate mutations synchronously", () => {
  assert.match(component, /const actionRef = useRef<string \| null>\(null\)/);
  assert.match(component, /async function confirm\(paymentId: string\) \{\s*if \(actionRef\.current\) return;/);
  assert.match(component, /actionRef\.current = actionToken;[\s\S]*setSavingId\(paymentId\);[\s\S]*await services\.confirm\(paymentId\)/);
  assert.match(component, /async function reportNotReceived\(paymentId: string\) \{\s*if \(actionRef\.current\) return;/);
  assert.match(component, /await services\.reportNotReceived\(paymentId, normalizedReason\)/);
});

test("payment polling cannot overwrite a pending mutation", () => {
  assert.match(component, /const requestIdRef = useRef\(0\)/);
  assert.match(component, /const activeRequestIdRef = useRef<number \| null>\(null\)/);
  assert.match(component, /if \(requestIdRef\.current !== requestId\) return;/);
  assert.match(component, /function invalidatePendingLoad\(\)[\s\S]*requestIdRef\.current \+= 1;[\s\S]*activeRequestIdRef\.current = null/);
  assert.match(component, /if \(!actionRef\.current\) void load\(\)/);
});

test("pending payment actions expose one accessible locked workflow", () => {
  assert.match(component, /aria-busy=\{interfaceBusy\}/);
  assert.match(component, /id=\{pendingId\}[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /disabled=\{interfaceBusy\}/);
  assert.match(component, /disabled=\{interfaceBusy \|\| reason\.trim\(\)\.length < 3\}/);
  assert.match(component, /disabled=\{interfaceBusy\}[\s\S]*setNegativePaymentId\(null\)/);
  assert.match(component, /reasonRequired/);
  assert.doesNotMatch(component, />Loading…</);
});

test("browser smoke covers duplicate confirm and not-received submissions", () => {
  for (const marker of [
    "data-confirm-calls",
    "data-report-calls",
    "data-confirm-locked",
    "data-report-locked",
    "data-payment-busy",
  ]) {
    assert.match(browserSmoke, new RegExp(marker));
  }
});

test("database-backed confirmation RPC boundaries remain unchanged", () => {
  assert.match(service, /rpc\("driver_confirm_verified_payment"/);
  assert.match(service, /rpc\("driver_report_payment_not_received"/);
  assert.doesNotMatch(component, /type="file"|receipt_path|payment-receipts/);
});
