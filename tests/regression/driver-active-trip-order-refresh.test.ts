import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const boundary = readFileSync(path.join(root, "src/components/driver/DriverActiveTripOrderBoundary.tsx"), "utf8");
const activeTrip = readFileSync(path.join(root, "src/pages/ActiveTrip.tsx"), "utf8");
const service = readFileSync(path.join(root, "src/services/driver.service.ts"), "utf8");
const driverMobileV4 = readFileSync(path.join(root, "apps/driver-mobile-app/src/main.tsx"), "utf8");
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
  assert.match(activeTrip, /loadActiveOrders=\{getMyActiveOrders\}/);
  assert.match(activeTrip, /loadLatestCancellation=\{getMyLatestCancelledOrder\}/);
  assert.match(activeTrip, /loadAssignedOrder=\{getMyAssignedOrder\}/);
  assert.match(activeTrip, /<ActiveTripContent key=\{order\.id\}/);
  assert.match(activeTrip, /onOrderChange=\{onOrderChange\}/);
  assert.doesNotMatch(activeTrip, /setInterval/);
  assert.match(service, /export async function getMyAssignedOrder/);
});

test("Active Trip order boundary does not evaluate production data services in deterministic fixtures", () => {
  assert.match(boundary, /import type \{ MyOrder \} from "\.\.\/\.\.\/services\/driver\.service"/);
  assert.doesNotMatch(boundary, /import \{[\s\S]*getMyActiveOrders|import \{[\s\S]*getMyAssignedOrder|import \{[\s\S]*getMyLatestCancelledOrder/);
  assert.match(boundary, /loadActiveOrders: \(\) => Promise<MyOrder\[\]>/);
  assert.match(boundary, /loadLatestCancellation: \(\) => Promise<MyOrder \| null>/);
  assert.match(boundary, /loadAssignedOrder: \(orderId: string\) => Promise<MyOrder \| null>/);
  assert.doesNotMatch(boundary, /supabase\.|\.from\("orders"\)|\.rpc\(/);
});

test("Active Trip order browser smoke covers retries, stale removal and mobile safety", () => {
  for (const width of [320, 360, 390, 412, 430, 768]) {
    assert.match(browserSmoke, new RegExp(`\\b${width}\\b`));
  }
  assert.match(browserSmoke, /data-fixture-boot="true"/);
  assert.match(browserSmoke, /data-verify-started="true"/);
  assert.match(browserSmoke, /data-initial-retry-guard="true"/);
  assert.match(browserSmoke, /data-refresh-retry-guard="true"/);
  assert.match(browserSmoke, /data-refresh-recovered="true"/);
  assert.match(browserSmoke, /data-stale-order-removed="true"/);
  assert.match(browserSmoke, /data-new-order-ready="true"/);
  assert.match(browserSmoke, /data-overflow="false"/);
  assert.match(regressionRunner, /driver-active-trip-order-refresh\.test\.ts/);
  assert.match(packageJson, /driver-active-trip-order-e2e-smoke\.mjs/);
});

test("Driver Mobile V4 removes Customer-cancelled jobs without requiring manual refresh", () => {
  assert.match(driverMobileV4, /\.eq\('status','placed'\)\.is\('driver_id',null\)/);
  assert.match(driverMobileV4, /driver-mobile-v4-orders-\$\{session\.user\.id\}/);
  assert.match(driverMobileV4, /\.on\('postgres_changes',\{event:'\*',schema:'public',table:'orders'\}/);
  assert.match(driverMobileV4, /window\.setInterval\(\(\)=>\{void refresh\(\)\},15_000\)/);
  assert.match(driverMobileV4, /document\.addEventListener\('visibilitychange',syncWhenVisible\)/);
  assert.match(driverMobileV4, /window\.addEventListener\('focus',syncOnFocus\)/);
  assert.match(driverMobileV4, /refreshRequest=useRef\(0\)/);
  assert.match(driverMobileV4, /if\(requestId!==refreshRequest\.current\)return/);
  assert.match(driverMobileV4, /void supabase\.removeChannel\(channel\)/);
});
