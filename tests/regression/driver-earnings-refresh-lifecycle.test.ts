import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const boundary = read("src/components/driver/DriverEarningsLoadBoundary.tsx");
const earnings = read("src/pages/Earnings.tsx");
const browser = read("scripts/driver-earnings-refresh-e2e-smoke.mjs");
const packageJson = read("package.json");

test("Driver earnings initial load and Retry share one synchronous request guard", () => {
  assert.match(boundary, /const busyRef = useRef\(false\)/);
  assert.match(boundary, /if \(busyRef\.current\)/);
  assert.match(boundary, /data-earnings-retry="true"/);
  assert.match(boundary, /disabled=\{loading\}/);
  assert.match(boundary, /Promise\.resolve\(\)\.then\(loadEarnings\)/);
});

test("payment changes queue only one follow-up earnings refresh", () => {
  assert.match(boundary, /queuedPaymentRefreshRef/);
  assert.match(boundary, /if \(reason === "payment"\) queuedPaymentRefreshRef\.current = true/);
  assert.match(boundary, /queuedPaymentRefreshRef\.current = false/);
  assert.match(boundary, /runRef\.current\("payment"\)/);
});

test("failed refresh preserves the last confirmed earnings and exposes recovery", () => {
  assert.match(boundary, /setData\(result\)/);
  assert.doesNotMatch(boundary, /catch[\s\S]*setData\(null\)/);
  assert.match(boundary, /last confirmed earnings remain visible/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /aria-live="assertive"/);
});

test("obsolete earnings responses cannot update an unmounted page", () => {
  assert.match(boundary, /requestIdRef/);
  assert.match(boundary, /!mountedRef\.current \|\| requestId !== requestIdRef\.current/);
  assert.match(boundary, /requestIdRef\.current \+= 1/);
});

test("Earnings page delegates refresh lifecycle without weakening finance boundaries", () => {
  assert.match(earnings, /DriverEarningsLoadBoundary/);
  assert.match(earnings, /loadEarnings=\{getDriverEarnings\}/);
  assert.match(earnings, /onPaymentChanged=\{onPaymentChanged\}/);
  assert.doesNotMatch(earnings, /useState<DriverEarningsSummary/);
  assert.doesNotMatch(earnings, /setData\(await getDriverEarnings\(\)\)/);
});

test("browser smoke covers retries, queued recovery and narrow mobile widths", () => {
  for (const width of [320, 360, 390, 412, 430, 768]) assert.match(browser, new RegExp(`\\b${width}\\b`));
  assert.match(browser, /data-retry-guarded/);
  assert.match(browser, /data-preserved-confirmed/);
  assert.match(browser, /data-queued-refresh/);
  assert.match(browser, /data-recovered/);
  assert.match(browser, /data-overflow/);
  assert.match(packageJson, /driver-earnings-refresh-e2e-smoke\.mjs/);
});
