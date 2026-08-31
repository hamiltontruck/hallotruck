import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const boundaryPath = new URL("../../src/components/driver/DriverEarningsLoadBoundary.tsx", import.meta.url);
const earningsPath = new URL("../../src/pages/Earnings.tsx", import.meta.url);
const browserPath = new URL("../../scripts/driver-earnings-refresh-e2e-smoke.mjs", import.meta.url);
const packagePath = new URL("../../package.json", import.meta.url);

const read = (url: URL) => readFile(url, "utf8");

test("Driver earnings initial load and Retry share one synchronous request guard", async () => {
  const source = await read(boundaryPath);
  assert.match(source, /const busyRef = useRef\(false\)/);
  assert.match(source, /if \(busyRef\.current\)/);
  assert.match(source, /data-earnings-retry="true"/);
  assert.match(source, /disabled=\{loading\}/);
  assert.match(source, /Promise\.resolve\(\)\.then\(loadEarnings\)/);
});

test("payment changes queue only one follow-up earnings refresh", async () => {
  const source = await read(boundaryPath);
  assert.match(source, /queuedPaymentRefreshRef/);
  assert.match(source, /if \(reason === "payment"\) queuedPaymentRefreshRef\.current = true/);
  assert.match(source, /queuedPaymentRefreshRef\.current = false/);
  assert.match(source, /runRef\.current\("payment"\)/);
});

test("failed refresh preserves the last confirmed earnings and exposes recovery", async () => {
  const source = await read(boundaryPath);
  assert.match(source, /setData\(result\)/);
  assert.doesNotMatch(source, /catch[\s\S]*setData\(null\)/);
  assert.match(source, /last confirmed earnings remain visible/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-live="assertive"/);
});

test("obsolete earnings responses cannot update an unmounted page", async () => {
  const source = await read(boundaryPath);
  assert.match(source, /requestIdRef/);
  assert.match(source, /!mountedRef\.current \|\| requestId !== requestIdRef\.current/);
  assert.match(source, /requestIdRef\.current \+= 1/);
});

test("Earnings page delegates refresh lifecycle without weakening finance boundaries", async () => {
  const source = await read(earningsPath);
  assert.match(source, /DriverEarningsLoadBoundary/);
  assert.match(source, /loadEarnings=\{getDriverEarnings\}/);
  assert.match(source, /onPaymentChanged=\{onPaymentChanged\}/);
  assert.doesNotMatch(source, /useState<DriverEarningsSummary/);
  assert.doesNotMatch(source, /setData\(await getDriverEarnings\(\)\)/);
});

test("browser smoke covers retries, queued recovery and narrow mobile widths", async () => {
  const [browser, packageJson] = await Promise.all([read(browserPath), read(packagePath)]);
  for (const width of [320, 360, 390, 412, 430, 768]) assert.match(browser, new RegExp(`\\b${width}\\b`));
  assert.match(browser, /data-retry-guarded/);
  assert.match(browser, /data-preserved-confirmed/);
  assert.match(browser, /data-queued-refresh/);
  assert.match(browser, /data-recovered/);
  assert.match(browser, /data-overflow/);
  assert.match(packageJson, /driver-earnings-refresh-e2e-smoke\.mjs/);
});
