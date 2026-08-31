import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4178;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".driver-deposit-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "driver-deposit-e2e.js");
const htmlFile = path.join(root, "dist", "driver-deposit-e2e.html");

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
    "--virtual-time-budget=12000",
    `--user-data-dir=${profileDirectory}`,
    "--dump-dom",
    url,
  ];

  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [headlessFlag, ...common], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
    if (result.error?.code === "ETIMEDOUT") throw new Error(`Chrome timed out while opening ${url}`);
  }
  throw new Error(`Chrome could not render ${url}`);
}

async function render(chrome, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-deposit-e2e-"));
  try {
    return dumpDom(chrome, `${baseUrl}driver-deposit-e2e.html`, profile, viewport);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

function assertContains(dom, expected, label) {
  for (const value of expected) {
    if (!dom.includes(value)) throw new Error(`${label} is missing expected text: ${value}`);
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
import { DriverDepositBalanceState } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverDepositBalanceState.tsx"))};
import { DriverDepositHistory } from ${JSON.stringify(path.join(root, "src", "components", "admin", "DriverDepositHistory.tsx"))};

const confirmedSummary = {
  admin_deposit_etb: 100000,
  commission_charged_etb: 18678,
  commission_paid_etb: 18272,
  available_deposit_etb: 99594,
  commission_due_etb: 0,
};
const recoveredSummary = {
  admin_deposit_etb: 120000,
  commission_charged_etb: 20000,
  commission_paid_etb: 19000,
  available_deposit_etb: 119000,
  commission_due_etb: 0,
};
const deposits = [
  {
    id: "deposit-active",
    driver_id: "driver-1",
    amount_etb: 100000,
    reference: "CASH-RECEIPT-" + "X".repeat(100),
    note: "Admin-recorded deposit with a deliberately long audit note for mobile wrapping.",
    status: "active",
    created_at: "2026-08-25T09:00:00.000Z",
  },
  {
    id: "deposit-reversed",
    driver_id: "driver-1",
    amount_etb: 5000,
    reference: "REV-0001",
    note: "Reversal: duplicate cash receipt",
    status: "reversed",
    created_at: "2026-08-24T09:00:00.000Z",
  },
];

let reversal = null;
let loadCalls = 0;
let realtimeRefresh = null;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitUntil = async (check, label, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await wait(20);
  }
  throw new Error("Timed out waiting for " + label);
};
const loadSummary = async () => {
  loadCalls += 1;
  if (loadCalls === 1) {
    await wait(80);
    return null;
  }
  if (loadCalls === 2) {
    await wait(180);
    return confirmedSummary;
  }
  if (loadCalls === 3) {
    await wait(180);
    throw new Error("Temporary driver ledger refresh failure.");
  }
  await wait(220);
  return recoveredSummary;
};
const subscribe = (onChange) => {
  realtimeRefresh = onChange;
  return () => { realtimeRefresh = null; };
};
const setTextarea = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

createRoot(document.getElementById("root")).render(React.createElement("main", { className: "min-h-screen min-w-0 overflow-x-hidden bg-[#f5f3ed] p-3 text-asphalt" },
  React.createElement(DriverDepositBalanceState, {
    language: "en",
    loadSummary,
    subscribe,
  }),
  React.createElement("section", { className: "mt-4 min-w-0 border border-asphalt/10 bg-white p-4" },
    React.createElement("h2", { className: "font-display text-xl font-semibold" }, "Deposit history"),
    React.createElement(DriverDepositHistory, {
      deposits,
      onReverse: async (depositId, reason) => { reversal = { depositId, reason }; },
    }),
  ),
));

await waitUntil(
  () => document.querySelector('[data-driver-deposit-state="unavailable"]'),
  "fulfilled empty deposit state",
);
document.documentElement.dataset.initialUnavailable = String(loadCalls === 1);

const retryButton = document.querySelector('[data-deposit-retry="true"]');
retryButton?.click();
retryButton?.click();
await waitUntil(
  () => document.querySelector('[data-driver-deposit-state="ready"]')?.textContent.includes("99,594 ETB"),
  "confirmed deposit after retry",
);
document.documentElement.dataset.retryGuarded = String(loadCalls === 2);

realtimeRefresh?.();
await wait(20);
realtimeRefresh?.();
realtimeRefresh?.();
await waitUntil(
  () => document.querySelector('[data-driver-deposit-state="stale"]')?.textContent.includes("99,594 ETB"),
  "preserved confirmed deposit during failed refresh",
);
document.documentElement.dataset.preservedConfirmed = "true";

await waitUntil(
  () => document.querySelector('[data-driver-deposit-state="ready"]')?.textContent.includes("119,000 ETB"),
  "queued deposit recovery",
);
document.documentElement.dataset.queuedRefresh = String(loadCalls === 4);
document.documentElement.dataset.recovered = "true";

const reverseButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent.includes("Reverse deposit"));
reverseButton?.click();
await waitUntil(() => document.querySelector("textarea"), "deposit reversal textarea");
const textarea = document.querySelector("textarea");
setTextarea(textarea, "Duplicate cash receipt");
document.querySelector('[data-reversal-form="true"]').requestSubmit();
await wait(250);

document.documentElement.dataset.reversalSubmitted = String(
  reversal?.depositId === "deposit-active" && reversal?.reason === "Duplicate cash receipt"
);
document.documentElement.dataset.activeCount = String(document.querySelectorAll('[data-deposit-id="deposit-active"]').length);
document.documentElement.dataset.reversedCount = String(document.querySelectorAll('[data-deposit-id="deposit-reversed"]').length);
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
    "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
    "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
  ], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver deposit fixture bundle failed.");

  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-deposit-e2e.js"></script></body></html>`, "utf8");
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
    const label = `Driver deposit ${width}px smoke`;
    assertContains(dom, [
      'data-ready="true"',
      'data-initial-unavailable="true"',
      'data-retry-guarded="true"',
      'data-preserved-confirmed="true"',
      'data-queued-refresh="true"',
      'data-recovered="true"',
      'data-reversal-submitted="true"',
      'data-active-count="1"',
      'data-reversed-count="1"',
      'data-overflow="false"',
      "Available deposit balance",
      "119,000 ETB",
      "Commission deducted",
      "1,000 ETB",
      "Deposit history",
      "active",
      "reversed",
    ], label);
  }
  console.log("Driver Deposit browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with fulfilled-empty recovery, guarded Retry, one queued realtime refresh, preserved confirmed balance, reversal submission and no horizontal overflow.");
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
