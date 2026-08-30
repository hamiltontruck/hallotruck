import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const state = readFileSync(
  path.join(root, "src/components/driver/DriverPaymentActionBannerState.tsx"),
  "utf8",
);
const wrapper = readFileSync(
  path.join(root, "src/components/driver/DriverPaymentCollectionBanner.tsx"),
  "utf8",
);
const browserSmoke = readFileSync(
  path.join(root, "scripts/driver-payment-action-banner-e2e-smoke.mjs"),
  "utf8",
);
const regressionRunner = readFileSync(path.join(root, "scripts/run-regression-tests.mjs"), "utf8");
const packageJson = readFileSync(path.join(root, "package.json"), "utf8");

test("payment action source failures preserve the last confirmed source instead of hiding work", () => {
  assert.match(state, /Promise\.allSettled/);
  assert.match(state, /confirmationResult\.status === "fulfilled"[\s\S]*: previous\.confirmations/);
  assert.match(state, /reportResult\.status === "fulfilled"[\s\S]*: previous\.reports/);
  assert.match(state, /nextErrors\.push\("confirmations"\)/);
  assert.match(state, /nextErrors\.push\("reports"\)/);
  assert.doesNotMatch(state, /confirmationResult\.status === "fulfilled" \? confirmationResult\.value : \[\]/);
  assert.doesNotMatch(state, /reportResult\.status === "fulfilled" \? reportResult\.value : \[\]/);
});

test("rapid Retry and realtime refreshes use one active request plus one queued refresh", () => {
  assert.match(state, /if \(busyRef\.current\) \{\s*queuedRef\.current = true;\s*return;/);
  assert.match(state, /const requestId = \+\+requestIdRef\.current/);
  assert.match(state, /requestId !== requestIdRef\.current/);
  assert.match(state, /queueMicrotask\(\(\) => void load\(\)\)/);
  assert.match(state, /subscribe\(\(\) => void load\(\)\)/);
});

test("payment action failures are visible, localized and retryable", () => {
  assert.match(state, /data-driver-payment-action-state="error"/);
  assert.match(state, /data-driver-payment-action-state=\{hasErrors \? "partial-error" : "ready"\}/);
  assert.match(state, /role="alert"/);
  assert.match(state, /aria-busy=\{refreshing\}/);
  assert.match(state, /disabled=\{refreshing\}/);
  assert.match(state, /Retry before assuming no action is required/);
  assert.match(state, /Hojii hin jiru jechuun dura deebiʼii yaali/);
  assert.match(state, /ምንም እርምጃ እንደማያስፈልግ/);
});

test("confirmation priority deduplicates a report for the same order", () => {
  assert.match(state, /const confirmationIds = new Set\(snapshot\.confirmations\.map/);
  assert.match(state, /snapshot\.reports\.filter\(\(row\) => !confirmationIds\.has\(row\.order_id\)\)/);
  assert.match(state, /data-driver-payment-action-count=\{snapshot\.confirmations\.length \+ visibleReports\.length\}/);
});

test("production wrapper keeps database-backed discovery and cleans up realtime subscription", () => {
  assert.match(wrapper, /getPendingDriverConfirmations/);
  assert.match(wrapper, /getUnreportedDeliveries/);
  assert.match(wrapper, /getDriverPaymentStatus/);
  assert.match(wrapper, /driver_payment_confirmation_events/);
  assert.match(wrapper, /supabase\.removeChannel\(channel\)/);
  assert.match(wrapper, /<DriverPaymentActionBannerState/);
});

test("browser smoke covers partial failure, guarded Retry, queued recovery and mobile safety", () => {
  for (const width of [320, 360, 390, 412, 430, 768]) {
    assert.match(browserSmoke, new RegExp(`\\b${width}\\b`));
  }
  assert.match(browserSmoke, /data-partial-task-visible="true"/);
  assert.match(browserSmoke, /data-retry-guard="true"/);
  assert.match(browserSmoke, /data-confirmation-priority="true"/);
  assert.match(browserSmoke, /data-realtime-queued="true"/);
  assert.match(browserSmoke, /data-stale-task-preserved="true"/);
  assert.match(browserSmoke, /data-recovered-task="true"/);
  assert.match(browserSmoke, /data-overflow="false"/);
  assert.match(regressionRunner, /driver-payment-action-banner-reliability\.test\.ts/);
  assert.match(packageJson, /driver-payment-action-banner-e2e-smoke\.mjs/);
});
