import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4195;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const testDirectory = path.join(root, ".driver-payment-action-banner-e2e");
const bundleFile = path.join(root, "dist", "driver-payment-action-banner-e2e.js");
const htmlFile = path.join(root, "dist", "driver-payment-action-banner-e2e.html");

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
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-payment-action-banner-e2e-"));
  try {
    const result = spawnSync(chrome, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=8000", `--user-data-dir=${profile}`, "--dump-dom",
      `${baseUrl}driver-payment-action-banner-e2e.html`,
    ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 35_000 });
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
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src/i18n/LanguageProvider.tsx"))};
import { DriverPaymentActionBannerState } from ${JSON.stringify(path.join(root, "src/components/driver/DriverPaymentActionBannerState.tsx"))};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reportA = {
  order_id: "order-a",
  tracking_id: "HT-PAY-A",
  price_etb: 75700,
  rejection_reason: null,
};
const confirmationA = {
  order_id: "order-a",
  tracking_id: "HT-PAY-A",
  price_etb: 75700,
  provider: "Bank of Abyssinia",
  provider_ref: "AV5689844",
};
const confirmationB = {
  order_id: "order-b",
  tracking_id: "HT-PAY-B",
  price_etb: 82000,
  provider: "Telebirr",
  provider_ref: "TB-220",
};

let confirmationCalls = 0;
let reportCalls = 0;
let subscriptionHandler = null;
let resolveRetryConfirmation;
let resolveRetryReport;
let rejectRealtimeConfirmation;
let rejectRealtimeReport;
let resolveQueuedConfirmation;
let resolveQueuedReport;

function loadConfirmations() {
  confirmationCalls += 1;
  if (confirmationCalls === 1) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("temporary confirmation source failure")), 20));
  }
  if (confirmationCalls === 2) {
    return new Promise((resolve) => { resolveRetryConfirmation = resolve; });
  }
  if (confirmationCalls === 3) {
    return new Promise((_, reject) => { rejectRealtimeConfirmation = reject; });
  }
  if (confirmationCalls === 4) {
    return new Promise((resolve) => { resolveQueuedConfirmation = resolve; });
  }
  return Promise.resolve([confirmationB]);
}

function loadReports() {
  reportCalls += 1;
  if (reportCalls === 1) return new Promise((resolve) => setTimeout(() => resolve([reportA]), 20));
  if (reportCalls === 2) {
    return new Promise((resolve) => { resolveRetryReport = resolve; });
  }
  if (reportCalls === 3) {
    return new Promise((_, reject) => { rejectRealtimeReport = reject; });
  }
  if (reportCalls === 4) {
    return new Promise((resolve) => { resolveQueuedReport = resolve; });
  }
  return Promise.resolve([]);
}

function subscribe(onChange) {
  subscriptionHandler = onChange;
  return () => { subscriptionHandler = null; };
}

function Fixture() {
  return React.createElement(
    DriverPaymentActionBannerState,
    { loadConfirmations, loadReports, subscribe },
  );
}

document.documentElement.dataset.fixtureBooted = "true";
createRoot(document.getElementById("root")).render(
  React.createElement(
    MemoryRouter,
    { initialEntries: ["/driver/home"] },
    React.createElement(LanguageProvider, null, React.createElement(Fixture)),
  ),
);

async function verify() {
  await delay(90);
  const partialBanner = document.querySelector('[data-driver-payment-action-state="partial-error"]');
  const partialTaskVisible = Boolean(
    partialBanner
    && partialBanner.getAttribute("data-driver-payment-action-order") === "order-a"
    && partialBanner.getAttribute("data-driver-payment-action-errors") === "confirmations"
    && partialBanner.querySelector('a[href="/driver/payment/order-a"]')
    && partialBanner.querySelector('[role="alert"]')
  );

  const retryButton = partialBanner?.querySelector("button");
  retryButton?.click();
  retryButton?.click();
  await delay(15);
  const retryGuard = confirmationCalls === 2
    && reportCalls === 2
    && Boolean(partialBanner?.querySelector("button:disabled"));

  resolveRetryConfirmation?.([confirmationA]);
  resolveRetryReport?.([reportA]);
  await delay(60);
  const confirmationBanner = document.querySelector('[data-driver-payment-action-state="ready"]');
  const confirmationPriority = Boolean(
    confirmationBanner
    && confirmationBanner.getAttribute("data-driver-payment-action-order") === "order-a"
    && confirmationBanner.getAttribute("data-driver-payment-action-count") === "1"
    && confirmationBanner.querySelector('a[href="/driver/payment/order-a"]')
    && !confirmationBanner.textContent.includes("+1")
  );

  subscriptionHandler?.();
  subscriptionHandler?.();
  await delay(15);
  const realtimeStartedOnce = confirmationCalls === 3
    && reportCalls === 3
    && document.querySelector('[data-driver-payment-action-banner][aria-busy="true"]');

  rejectRealtimeConfirmation?.(new Error("realtime confirmation failure"));
  rejectRealtimeReport?.(new Error("realtime report failure"));
  await delay(35);
  const queuedRefreshStarted = confirmationCalls === 4 && reportCalls === 4;
  const staleBanner = document.querySelector('[data-driver-payment-action-state="partial-error"]');
  const staleTaskPreserved = Boolean(
    staleBanner
    && staleBanner.getAttribute("data-driver-payment-action-order") === "order-a"
    && staleBanner.getAttribute("data-driver-payment-action-errors") === "confirmations,reports"
    && staleBanner.getAttribute("aria-busy") === "true"
  );

  resolveQueuedConfirmation?.([confirmationB]);
  resolveQueuedReport?.([]);
  await delay(70);
  const recoveredBanner = document.querySelector('[data-driver-payment-action-state="ready"]');
  const recoveredTask = Boolean(
    recoveredBanner
    && recoveredBanner.getAttribute("data-driver-payment-action-order") === "order-b"
    && recoveredBanner.getAttribute("data-driver-payment-action-count") === "1"
    && recoveredBanner.querySelector('a[href="/driver/payment/order-b"]')
    && !recoveredBanner.hasAttribute("data-driver-payment-action-errors")
  );

  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth
    || document.body.scrollWidth > document.body.clientWidth;
  document.documentElement.dataset.partialTaskVisible = String(partialTaskVisible);
  document.documentElement.dataset.retryGuard = String(retryGuard);
  document.documentElement.dataset.confirmationPriority = String(confirmationPriority);
  document.documentElement.dataset.realtimeQueued = String(Boolean(realtimeStartedOnce && queuedRefreshStarted));
  document.documentElement.dataset.staleTaskPreserved = String(staleTaskPreserved);
  document.documentElement.dataset.recoveredTask = String(recoveredTask);
  document.documentElement.dataset.overflow = String(overflow);
  document.documentElement.dataset.ready = "true";
}

window.addEventListener("error", (event) => {
  document.documentElement.dataset.fixtureError = event.error?.message || event.message || "runtime error";
  document.documentElement.dataset.ready = "true";
});
window.addEventListener("unhandledrejection", (event) => {
  document.documentElement.dataset.fixtureError = event.reason?.message || String(event.reason);
  document.documentElement.dataset.ready = "true";
});

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
  ], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver payment action banner fixture bundle failed.");

  await writeFile(
    htmlFile,
    `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-payment-action-banner-e2e.js"></script></body></html>`,
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
      'data-fixture-booted="true"',
      'data-ready="true"',
      'data-partial-task-visible="true"',
      'data-retry-guard="true"',
      'data-confirmation-priority="true"',
      'data-realtime-queued="true"',
      'data-stale-task-preserved="true"',
      'data-recovered-task="true"',
      'data-overflow="false"',
    ]) {
      if (!dom.includes(expected)) throw new Error(`Driver payment action banner ${width}px smoke is missing: ${expected}`);
    }
    if (dom.includes("data-fixture-error=")) throw new Error(`Driver payment action banner ${width}px fixture reported an error.`);
  }
  console.log("Driver payment action banner browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with visible partial failures, guarded Retry, confirmation deduplication, one queued realtime refresh, stale-action preservation, recovery and no horizontal overflow.");
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
