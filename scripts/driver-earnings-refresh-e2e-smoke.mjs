import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4181;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".driver-earnings-refresh-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "driver-earnings-refresh-e2e.js");
const htmlFile = path.join(root, "dist", "driver-earnings-refresh-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Preview server returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error("Preview server did not start in time.");
}

function dumpDom(chrome, url, profileDirectory, viewport) {
  const common = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=15000",
    `--user-data-dir=${profileDirectory}`,
    "--dump-dom",
    url,
  ];

  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [headlessFlag, ...common], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 35_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
    if (result.error?.code === "ETIMEDOUT") throw new Error(`Chrome timed out while opening ${url}`);
  }
  throw new Error(`Chrome could not render ${url}`);
}

async function render(chrome, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-earnings-refresh-e2e-"));
  try {
    return dumpDom(chrome, `${baseUrl}driver-earnings-refresh-e2e.html`, profile, viewport);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

function assertContains(dom, expected, label) {
  for (const value of expected) {
    if (!dom.includes(value)) throw new Error(`${label} is missing: ${value}`);
  }
}

async function prepareFixture() {
  await mkdir(testDirectory, { recursive: true });
  const assetFiles = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found in dist/assets.");

  const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { DriverEarningsLoadBoundary } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverEarningsLoadBoundary.tsx"))};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const until = async (check, label, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await wait(20);
  }
  throw new Error("Timed out waiting for " + label);
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
};
const summary = (completedTrips) => ({
  completedTrips,
  releasedTrips: completedTrips,
  totalReleasedEtb: completedTrips * 1000,
  totalCommissionEtb: completedTrips * 20,
  totalDriverNetEtb: completedTrips * 980,
  partialReleasedEtb: 0,
  pendingTrips: 0,
  pendingBalanceEtb: 0,
  pendingDriverBalanceEtb: 0,
  trips: [],
  released: [],
  pending: [],
});

let calls = 0;
const retryRequest = deferred();
const failedRefresh = deferred();
const queuedRecovery = deferred();
const loadEarnings = () => {
  calls += 1;
  if (calls === 1) return Promise.reject(new Error("initial earnings unavailable"));
  if (calls === 2) return retryRequest.promise;
  if (calls === 3) return failedRefresh.promise;
  if (calls === 4) return queuedRecovery.promise;
  return Promise.resolve(summary(99));
};

const App = () => React.createElement("main", { className: "min-h-screen bg-[#f5f3ed] p-3 text-asphalt" },
  React.createElement(DriverEarningsLoadBoundary, { language: "om", loadEarnings }, (data, onPaymentChanged) =>
    React.createElement("section", { className: "border border-line bg-white p-4" },
      React.createElement("p", { "data-completed": String(data.completedTrips), className: "font-display text-2xl font-bold" }, String(data.completedTrips) + " trips"),
      React.createElement("button", { type: "button", "data-payment-changed": "true", onClick: onPaymentChanged, className: "mt-4 min-h-11 bg-asphalt px-4 py-3 text-white" }, "Payment changed")
    )
  )
);

window.addEventListener("error", (event) => { document.documentElement.dataset.runtimeError = String(event.error?.message || event.message || "error"); });
window.addEventListener("unhandledrejection", (event) => { document.documentElement.dataset.runtimeError = String(event.reason?.message || event.reason || "rejection"); });
createRoot(document.getElementById("root")).render(React.createElement(App));

document.documentElement.dataset.fixtureBoot = "true";
await until(() => document.querySelector('[data-earnings-retry="true"]'), "initial Retry");
const retry = document.querySelector('[data-earnings-retry="true"]');
retry.click();
retry.click();
await wait(50);
document.documentElement.dataset.retryGuarded = String(calls === 2);
retryRequest.resolve(summary(2));
await until(() => document.querySelector('[data-completed="2"]'), "confirmed earnings");

const payment = document.querySelector('[data-payment-changed="true"]');
payment.click();
payment.click();
await wait(50);
document.documentElement.dataset.singleRefreshStart = String(calls === 3);
failedRefresh.reject(new Error("temporary payment refresh failure"));
await until(() => calls === 4, "queued payment refresh");
await until(() => document.querySelector('[role="alert"]'), "refresh warning");
document.documentElement.dataset.preservedConfirmed = String(Boolean(document.querySelector('[data-completed="2"]')));
document.documentElement.dataset.queuedRefresh = String(calls === 4);
queuedRecovery.resolve(summary(3));
await until(() => document.querySelector('[data-completed="3"]'), "recovered earnings");
await until(() => !document.querySelector('[role="alert"]'), "cleared refresh warning");
document.documentElement.dataset.recovered = String(
  calls === 4
  && document.querySelector('[data-driver-earnings-state="true"]')?.getAttribute("data-loading") === "false"
  && document.querySelector('[data-driver-earnings-state="true"]')?.getAttribute("data-error") === "false"
);
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth
  || document.body.scrollWidth > document.body.clientWidth
);
document.documentElement.dataset.ready = "true";
`;

  await writeFile(entryFile, fixtureSource, "utf8");
  const bundled = spawnSync(esbuildBinary, [
    entryFile,
    "--bundle",
    "--platform=browser",
    "--format=esm",
    "--target=chrome120",
    `--outfile=${bundleFile}`,
  ], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver earnings refresh fixture bundle failed.");

  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-earnings-refresh-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let previewOutput = "";
preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const dom = await render(chrome, { width, height: 915 });
    const label = `Driver earnings refresh ${width}px smoke`;
    assertContains(dom, [
      'data-fixture-boot="true"',
      'data-ready="true"',
      'data-retry-guarded="true"',
      'data-single-refresh-start="true"',
      'data-preserved-confirmed="true"',
      'data-queued-refresh="true"',
      'data-recovered="true"',
      'data-overflow="false"',
      'data-completed="3"',
    ], label);
    if (dom.includes("data-runtime-error=")) throw new Error(`${label} reported a runtime error.`);
  }
  console.log("Driver earnings refresh browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with guarded Retry, one queued payment refresh, preserved confirmed earnings, recovery and no horizontal overflow.");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([
    rm(testDirectory, { recursive: true, force: true }),
    rm(bundleFile, { force: true }),
    rm(htmlFile, { force: true }),
  ]);
}
