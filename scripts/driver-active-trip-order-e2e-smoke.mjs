import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4194;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const testDirectory = path.join(root, ".driver-active-trip-order-e2e");
const bundleFile = path.join(root, "dist", "driver-active-trip-order-e2e.js");
const htmlFile = path.join(root, "dist", "driver-active-trip-order-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* preview is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

async function render(chrome, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-active-trip-order-e2e-"));
  try {
    const result = spawnSync(chrome, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=7000", `--user-data-dir=${profile}`, "--dump-dom",
      `${baseUrl}driver-active-trip-order-e2e.html`,
    ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
    return result.stdout;
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

async function prepareFixture() {
  await mkdir(testDirectory, { recursive: true });
  const assets = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assets.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found.");

  const source = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src/i18n/LanguageProvider.tsx"))};
import { DriverActiveTripOrderBoundary } from ${JSON.stringify(path.join(root, "src/components/driver/DriverActiveTripOrderBoundary.tsx"))};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const orderA = {
  id: "order-a",
  tracking_id: "HT-ORDER-A",
  status: "accepted",
  pickup_address: "Addis Ababa",
  dropoff_address: "Adama",
  price_etb: 10000,
  payment_terms: "bank",
  cancellation_reason: null,
  cancelled_at: null,
};
const orderB = {
  ...orderA,
  id: "order-b",
  tracking_id: "HT-ORDER-B",
  pickup_address: "Adama",
  dropoff_address: "Dire Dawa",
};

let activeLoadAttempts = 0;
let refreshAttempts = 0;
let resolveInitialRetry;
let resolveRefreshRetry;

function loadActiveOrders() {
  activeLoadAttempts += 1;
  if (activeLoadAttempts === 1) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("temporary initial failure")), 20));
  }
  if (activeLoadAttempts === 2) {
    return new Promise((resolve) => {
      resolveInitialRetry = () => resolve([orderA]);
    });
  }
  return new Promise((resolve) => setTimeout(() => resolve([orderB]), 20));
}

function loadLatestCancellation() {
  return Promise.resolve(null);
}

function loadAssignedOrder(orderId) {
  if (orderId === orderB.id) return Promise.resolve(orderB);
  refreshAttempts += 1;
  if (refreshAttempts === 1) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("temporary refresh failure")), 25));
  }
  if (refreshAttempts === 2) {
    return new Promise((resolve) => {
      resolveRefreshRetry = () => resolve({ ...orderA, status: "in_transit" });
    });
  }
  if (refreshAttempts === 3) return Promise.resolve(null);
  return Promise.resolve({ ...orderA, status: "in_transit" });
}

function TripView({ order }) {
  const [mountedOrder] = useState(order.id);
  return React.createElement("article", {
    className: "mx-auto max-w-2xl px-3 py-4",
    "data-trip-order": order.id,
    "data-trip-status": order.status,
    "data-mounted-order": mountedOrder,
  }, order.tracking_id + " " + order.status);
}

function Fixture() {
  return React.createElement("main", { className: "min-h-screen px-2" },
    React.createElement(DriverActiveTripOrderBoundary, {
      loadActiveOrders,
      loadLatestCancellation,
      loadAssignedOrder,
      pollIntervalMs: 350,
      renderCancelled: (order) => React.createElement("div", { "data-cancelled-order": order.id }, "Cancelled"),
      renderEmpty: () => React.createElement("div", { "data-empty-trip": "true", className: "text-center" }, "No active trip"),
    }, ({ order, onOrderChange }) => React.createElement(TripView, { key: order.id, order, onOrderChange }))
  );
}

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null, React.createElement(Fixture))
);

async function verify() {
  await delay(70);
  const initialError = document.querySelector('[data-active-trip-order-error="initial"]');
  const initialRetry = initialError?.querySelector("button");
  const initialErrorReady = Boolean(initialError && initialRetry && document.querySelector('[data-active-trip-order-state="error"]'));

  initialRetry?.click();
  initialRetry?.click();
  await delay(15);
  const initialRetryGuard = activeLoadAttempts === 2 && Boolean(document.querySelector('[data-active-trip-order-state="loading"]'));

  resolveInitialRetry?.();
  await delay(80);
  const refreshError = document.querySelector('[data-active-trip-order-state="refresh-error"]');
  const refreshRetry = refreshError?.querySelector("button");
  const confirmedTripKept = Boolean(
    refreshError
    && refreshRetry
    && document.querySelector('[data-trip-order="order-a"]')
    && document.querySelector('[data-active-trip-order-error="refresh"]')
  );

  refreshRetry?.click();
  refreshRetry?.click();
  await delay(15);
  const refreshRetryGuard = refreshAttempts === 2 && Boolean(
    document.querySelector('[data-active-trip-order-error="refresh"] button:disabled')
  );

  resolveRefreshRetry?.();
  await delay(50);
  const refreshRecovered = Boolean(
    document.querySelector('[data-active-trip-order-state="ready"]')
    && document.querySelector('[data-trip-order="order-a"][data-trip-status="in_transit"]')
    && !document.querySelector('[data-active-trip-order-error="refresh"]')
  );

  await delay(330);
  const notAssignedError = document.querySelector('[data-active-trip-order-error="not_assigned"]');
  const staleOrderRemoved = Boolean(
    notAssignedError
    && document.querySelector('[data-empty-trip="true"]')
    && !document.querySelector('[data-trip-order="order-a"]')
  );

  const reloadButton = notAssignedError?.querySelector("button");
  reloadButton?.click();
  reloadButton?.click();
  await delay(90);
  const newOrderReady = Boolean(
    activeLoadAttempts === 3
    && document.querySelector('[data-active-trip-order-state="ready"]')
    && document.querySelector('[data-trip-order="order-b"][data-mounted-order="order-b"]')
    && !document.querySelector('[data-trip-order="order-a"]')
  );

  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth;
  document.documentElement.dataset.initialErrorReady = String(initialErrorReady);
  document.documentElement.dataset.initialRetryGuard = String(initialRetryGuard);
  document.documentElement.dataset.confirmedTripKept = String(confirmedTripKept);
  document.documentElement.dataset.refreshRetryGuard = String(refreshRetryGuard);
  document.documentElement.dataset.refreshRecovered = String(refreshRecovered);
  document.documentElement.dataset.staleOrderRemoved = String(staleOrderRemoved);
  document.documentElement.dataset.newOrderReady = String(newOrderReady);
  document.documentElement.dataset.overflow = String(overflow);
  document.documentElement.dataset.ready = "true";
}

void verify().catch((error) => {
  document.documentElement.dataset.fixtureError = error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.ready = "true";
});
`;

  const entry = path.join(testDirectory, "entry.mjs");
  await writeFile(entry, source, "utf8");
  const bundled = spawnSync(bin("esbuild"), [
    entry,
    "--bundle",
    "--platform=browser",
    "--format=esm",
    "--target=chrome120",
    `--outfile=${bundleFile}`,
    "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
    "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
  ], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver Active Trip order fixture bundle failed.");

  await writeFile(
    htmlFile,
    `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-active-trip-order-e2e.js"></script></body></html>`,
    "utf8",
  );
}

await prepareFixture();
const preview = spawn(bin("vite"), ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const dom = await render(chrome, { width, height: 1200 });
    for (const expected of [
      'data-ready="true"',
      'data-initial-error-ready="true"',
      'data-initial-retry-guard="true"',
      'data-confirmed-trip-kept="true"',
      'data-refresh-retry-guard="true"',
      'data-refresh-recovered="true"',
      'data-stale-order-removed="true"',
      'data-new-order-ready="true"',
      'data-overflow="false"',
    ]) {
      if (!dom.includes(expected)) throw new Error(`Driver Active Trip order ${width}px smoke is missing: ${expected}`);
    }
    if (dom.includes("data-fixture-error=")) throw new Error(`Driver Active Trip order ${width}px fixture reported an error.`);
  }
  console.log("Driver Active Trip order lifecycle browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with guarded initial/refresh retries, recovered status, stale assignment removal, new-order remounting and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([
    rm(testDirectory, { recursive: true, force: true }),
    rm(bundleFile, { force: true }),
    rm(htmlFile, { force: true }),
  ]);
}
