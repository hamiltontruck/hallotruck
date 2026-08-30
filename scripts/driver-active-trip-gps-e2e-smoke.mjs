import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4192;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".driver-active-trip-gps-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "driver-active-trip-gps-e2e.js");
const htmlFile = path.join(root, "dist", "driver-active-trip-gps-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until Vite preview is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profile) {
  const args = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--window-size=${width},1100`,
    "--virtual-time-budget=7000",
    `--user-data-dir=${profile}`,
    "--dump-dom",
    `${baseUrl}driver-active-trip-gps-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 15 * 1024 * 1024,
      timeout: 35_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Driver Active Trip GPS at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");

const fixtureSource = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src", "i18n", "LanguageProvider.tsx"))};
import { DriverActiveTripGpsControl } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverActiveTripGpsControl.tsx"))};
import { DriverActiveTripRoute } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverActiveTripRoute.tsx"))};

localStorage.setItem("hallo_language", "en");
let online = false;
let pendingCount = 0;
let watchCalls = 0;
let clearCalls = 0;
let sendCalls = 0;
let syncCalls = 0;
let routeCalls = 0;
let positionSuccess = null;
let fixtureError = "";

window.addEventListener("error", (event) => {
  fixtureError ||= event.error?.message || event.message || "window error";
});
window.addEventListener("unhandledrejection", (event) => {
  fixtureError ||= event.reason instanceof Error ? event.reason.message : String(event.reason || "unhandled rejection");
});

Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    watchPosition(success) {
      watchCalls += 1;
      positionSuccess = success;
      return 42;
    },
    clearWatch() {
      clearCalls += 1;
    },
  },
});

const initialOrder = {
  id: "active-trip-gps-smoke",
  tracking_id: "HT-GPS-SMOKE",
  status: "accepted",
  pickup_address: "Adama Industrial Park",
  dropoff_address: "Djibouti Port long destination address",
  price_etb: 50000,
  payment_terms: "bank",
  cancellation_reason: null,
  cancelled_at: null,
};

const services = {
  async sendOrQueuePing() {
    sendCalls += 1;
    pendingCount = 1;
    return "queued";
  },
  async syncPendingPings() {
    syncCalls += 1;
    pendingCount = 0;
    return { syncedCount: 1, remainingCount: 0, syncedOrderIds: [initialOrder.id] };
  },
  getPendingPingCountForOrder() {
    return pendingCount;
  },
  async getMyAssignedOrder() {
    return { ...initialOrder, status: "in_transit" };
  },
};

const routeServices = {
  async getNavigation() {
    routeCalls += 1;
    if (routeCalls === 1) throw new Error("Route network unavailable");
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      geometry: {
        type: "LineString",
        coordinates: [[38.75, 9.03], [38.8, 9.08]],
      },
      distanceKm: 12,
      durationMin: 20,
      steps: [
        { instruction: "Head north toward the corridor", distanceM: 500, durationSec: 60, location: [38.75, 9.03] },
        { instruction: "Continue to the destination", distanceM: 11500, durationSec: 1140, location: [38.8, 9.08] },
      ],
    };
  },
};

function Harness() {
  const [order, setOrder] = useState(initialOrder);
  const [sharing, setSharing] = useState(false);
  const [position, setPosition] = useState(null);
  return React.createElement("main", { className: "min-h-screen bg-bone p-3" },
    React.createElement("p", { "data-sharing-value": String(sharing) }, order.status),
    React.createElement(DriverActiveTripGpsControl, {
      order,
      onOrderChange: setOrder,
      onPosition: setPosition,
      onSharingChange: setSharing,
      services,
    }),
    React.createElement(DriverActiveTripRoute, {
      orderId: order.id,
      driverPosition: position,
      gpsSharing: sharing,
      services: routeServices,
      renderMap: () => React.createElement("div", { className: "h-full", "data-route-map": "true" }),
    }),
  );
}

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null, React.createElement(Harness)),
);

let routeFixtureRendered = false;
let routeErrorVisible = false;
let routeRetryBusy = false;
let routeLoaded = false;
let routeErrorCleared = false;
let gpsFixtureRendered = false;
let requestingBusy = false;
let orderBeforeSync = "missing";
let queuedGuidance = false;
let retryVisible = false;
let statusSemantics = false;
let orderAfterSync = "missing";
let liveGuidance = false;
let initialStartCount = 0;

try {
  await new Promise((resolve) => setTimeout(resolve, 350));
  let routePanel = document.querySelector("[data-driver-route-control]");
  const routeRetry = routePanel?.querySelector("[data-route-retry-action]");
  routeFixtureRendered = Boolean(routePanel && routeRetry);
  routeErrorVisible = routePanel?.textContent?.includes("Route network unavailable") ?? false;

  if (routeRetry) {
    routeRetry.click();
    routeRetry.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    routePanel = document.querySelector("[data-driver-route-control]");
    routeRetryBusy = routePanel?.getAttribute("aria-busy") === "true";
    await new Promise((resolve) => setTimeout(resolve, 220));
    routePanel = document.querySelector("[data-driver-route-control]");
    routeLoaded = Boolean(routePanel?.querySelector('[data-route-map="true"]')) && (routePanel?.textContent?.includes("Head north toward the corridor") ?? false);
    routeErrorCleared = !(routePanel?.textContent?.includes("Route network unavailable") ?? false);
  }

  let panel = document.querySelector("[data-driver-gps-control]");
  initialStartCount = document.querySelectorAll("[data-gps-start-action]").length;
  const start = document.querySelector("[data-gps-start-action]");
  gpsFixtureRendered = Boolean(panel && start);

  if (panel && start) {
    start.click();
    start.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    requestingBusy = panel.getAttribute("aria-busy") === "true";

    if (positionSuccess) {
      positionSuccess({
        coords: {
          longitude: 38.75,
          latitude: 9.03,
          speed: 12,
          heading: 90,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 180));
      panel = document.querySelector("[data-driver-gps-control]");
      orderBeforeSync = panel?.getAttribute("data-gps-order-status") || "missing";
      queuedGuidance = panel?.textContent?.includes("GPS update saved offline") ?? false;
      retryVisible = Boolean(panel?.querySelector("[data-gps-retry-action]"));
      statusSemantics = Boolean(panel?.querySelector('[role="status"][aria-live="polite"]'));

      online = true;
      window.dispatchEvent(new Event("online"));
      await new Promise((resolve) => setTimeout(resolve, 300));
      panel = document.querySelector("[data-driver-gps-control]");
      orderAfterSync = panel?.getAttribute("data-gps-order-status") || "missing";
      liveGuidance = panel?.textContent?.includes("Trip started") ?? false;
    }
  }
} catch (error) {
  fixtureError ||= error instanceof Error ? error.message : String(error);
}

document.documentElement.dataset.ready = "true";
document.documentElement.dataset.fixtureError = fixtureError || "none";
document.documentElement.dataset.routeFixtureRendered = String(routeFixtureRendered);
document.documentElement.dataset.gpsFixtureRendered = String(gpsFixtureRendered);
document.documentElement.dataset.watchCalls = String(watchCalls);
document.documentElement.dataset.sendCalls = String(sendCalls);
document.documentElement.dataset.syncCalls = String(syncCalls);
document.documentElement.dataset.clearCalls = String(clearCalls);
document.documentElement.dataset.routeCalls = String(routeCalls);
document.documentElement.dataset.routeErrorVisible = String(routeErrorVisible);
document.documentElement.dataset.routeRetryBusy = String(routeRetryBusy);
document.documentElement.dataset.routeLoaded = String(routeLoaded);
document.documentElement.dataset.routeErrorCleared = String(routeErrorCleared);
document.documentElement.dataset.onlyOneStart = String(initialStartCount === 1);
document.documentElement.dataset.requestingBusy = String(requestingBusy);
document.documentElement.dataset.orderBeforeSync = String(orderBeforeSync);
document.documentElement.dataset.orderAfterSync = String(orderAfterSync);
document.documentElement.dataset.queuedGuidance = String(queuedGuidance);
document.documentElement.dataset.retryVisible = String(retryVisible);
document.documentElement.dataset.statusSemantics = String(statusSemantics);
document.documentElement.dataset.liveGuidance = String(liveGuidance);
document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
`;

await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [
  entryFile,
  "--bundle",
  "--platform=browser",
  "--format=esm",
  "--target=chrome120",
  `--outfile=${bundleFile}`,
  "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
  "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
  "--define:import.meta.env.VITE_SUPABASE_FUNCTIONS_URL=\"https://example.supabase.co/functions/v1\"",
], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver Active Trip GPS fixture bundle failed.");
await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-active-trip-gps-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-active-trip-gps-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-ready="true"',
        'data-fixture-error="none"',
        'data-route-fixture-rendered="true"',
        'data-gps-fixture-rendered="true"',
        'data-watch-calls="1"',
        'data-send-calls="1"',
        'data-sync-calls="1"',
        'data-route-calls="2"',
        'data-route-error-visible="true"',
        'data-route-retry-busy="true"',
        'data-route-loaded="true"',
        'data-route-error-cleared="true"',
        'data-only-one-start="true"',
        'data-requesting-busy="true"',
        'data-order-before-sync="accepted"',
        'data-order-after-sync="in_transit"',
        'data-queued-guidance="true"',
        'data-retry-visible="true"',
        'data-status-semantics="true"',
        'data-live-guidance="true"',
        'data-overflow="false"',
      ]) {
        if (!dom.includes(expected)) {
          const fixtureErrorMatch = dom.match(/data-fixture-error="([^"]*)"/);
          const fixtureErrorValue = fixtureErrorMatch?.[1] ?? "unavailable";
          throw new Error(`Driver Active Trip GPS ${width}px smoke missing: ${expected}; fixture error: ${fixtureErrorValue}`);
        }
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Driver Active Trip GPS and route browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with one guarded GPS start, honest offline queue state, reconnect sync, one guarded route retry, recovered directions and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([
    rm(testDirectory, { recursive: true, force: true }),
    rm(bundleFile, { force: true }),
    rm(htmlFile, { force: true }),
  ]);
}
