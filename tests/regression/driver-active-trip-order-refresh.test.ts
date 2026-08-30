import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const boundary = readFileSync(path.join(root, "src/components/driver/DriverActiveTripOrderBoundary.tsx"), "utf8");
const activeTrip = readFileSync(path.join(root, "src/pages/ActiveTrip.tsx"), "utf8");
const service = readFileSync(path.join(root, "src/services/driver.service.ts"), "utf8");
const browserSmoke = readFileSync(path.join(root, "scripts/driver-active-trip-order-e2e-smoke.mjs"), "utf8");
const regressionRunner = readFileSync(path.join(root, "scripts/run-regression-tests.mjs"), "utf8");
const packageJson = readFileSync(path.join(root, "package.json"), "utf8");

test("Active Trip initial load has one guarded retry workflow", () => {
  assert.match(boundary, /if \(initialBusyRef\.current\) return/);
  assert.match(boundary, /const requestId = \+\+initialRequestIdRef\.current/);
  assert.match(boundary, /setError\("initial"\)/);
  assert.match(boundary, /data-active-trip-order-state="loading"/);
  assert.match(boundary, /Retry trip status/);
  assert.match(boundary, /Haala trip deebiʼii ilaali/);
  assert.match(boundary, /የጉዞውን ሁኔታ እንደገና ይሞክሩ/);
});

test("Active Trip polling removes stale assignments and inactive trips", () => {
  assert.match(boundary, /if \(!current\) \{[\s\S]*setError\("not_assigned"\)[\s\S]*setOrder\(null\)/);
  assert.match(boundary, /if \(!ACTIVE_TRIP_STATUSES\.has\(current\.status\)\) \{[\s\S]*setError\("inactive"\)[\s\S]*setOrder\(null\)/);
  assert.match(boundary, /current\.status === "cancelled"/);
  assert.match(boundary, /setCancelledOrder\(isCancellationDismissed\(current\) \? null : current\)/);
});

test("Active Trip refresh keeps the last confirmed trip on transient failure and clears recovered errors", () => {
  assert.match(boundary, /if \(refreshBusyRef\.current\) return/);
  assert.match(boundary, /const requestId = \+\+refreshRequestIdRef\.current/);
  assert.match(boundary, /setError\("refresh"\)/);
  assert.match(boundary, /setOrder\(current\);\s*setCancelledOrder\(null\);\s*setError\(null\)/);
  assert.match(boundary, /data-active-trip-order-state=\{error === "refresh" \? "refresh-error" : "ready"\}/);
  assert.match(boundary, /window\.setInterval\(\(\) => void refreshOrder\(orderId\), pollIntervalMs\)/);
});

test("Active Trip page delegates lifecycle ownership and remounts order-specific GPS state", () => {
  assert.match(activeTrip, /<DriverActiveTripOrderBoundary/);
  assert.match(activeTrip, /<ActiveTripContent key=\{order\.id\}/);
  assert.match(activeTrip, /onOrderChange=\{onOrderChange\}/);
  assert.doesNotMatch(activeTrip, /getMyActiveOrders|getMyAssignedOrder|getMyLatestCancelledOrder|setInterval/);
  assert.match(service, /export async function getMyAssignedOrder/);
  assert.doesNotMatch(boundary, /supabase\.|\.from\("orders"\)|\.rpc\(/);
});

test("Active Trip order browser smoke covers retries, stale removal and mobile safety", () => {
  for (const width of [320, 360, 390, 412, 430, 768]) {
    assert.match(browserSmoke, new RegExp(`\\b${width}\\b`));
  }
  assert.match(browserSmoke, /data-initial-retry-guard="true"/);
  assert.match(browserSmoke, /data-refresh-retry-guard="true"/);
  assert.match(browserSmoke, /data-refresh-recovered="true"/);
  assert.match(browserSmoke, /data-stale-order-removed="true"/);
  assert.match(browserSmoke, /data-new-order-ready="true"/);
  assert.match(browserSmoke, /data-overflow="false"/);
  assert.match(regressionRunner, /driver-active-trip-order-refresh\.test\.ts/);
  assert.match(packageJson, /driver-active-trip-order-e2e-smoke\.mjs/);
});
