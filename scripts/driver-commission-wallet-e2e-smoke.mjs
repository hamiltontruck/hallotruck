import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4195;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const testDirectory = path.join(root, ".driver-commission-wallet-e2e");
const bundleFile = path.join(root, "dist", "driver-commission-wallet-e2e.js");
const htmlFile = path.join(root, "dist", "driver-commission-wallet-e2e.html");

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
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-commission-wallet-e2e-"));
  try {
    const result = spawnSync(chrome, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=12000",
      `--user-data-dir=${profile}`,
      "--dump-dom",
      `${baseUrl}driver-commission-wallet-e2e.html`,
    ], { cwd: root, encoding: "utf8", maxBuffer: 24 * 1024 * 1024, timeout: 40_000 });
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
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src/i18n/LanguageProvider.tsx"))};
import { DriverCommissionWalletState } from ${JSON.stringify(path.join(root, "src/components/driver/DriverCommissionWalletState.tsx"))};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, label, timeout = 3500) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  throw new Error("Timed out waiting for " + label);
};

const payment = (id, transactionId) => ({
  id,
  driver_id: "driver-1",
  provider: "Telebirr",
  transaction_id: transactionId,
  amount_etb: 500,
  receipt_path: "driver-1/receipt.pdf",
  status: "pending",
  rejection_reason: null,
  submitted_at: "2026-08-30T10:00:00.000Z",
  reviewed_at: null,
});

let summaryCalls = 0;
let paymentCalls = 0;
let receiptCalls = 0;

async function primarySummaryLoader() {
  summaryCalls += 1;
  const call = summaryCalls;
  await delay(call === 2 ? 80 : 30);
  if (call === 2) throw new Error("temporary summary failure");
  return call === 1
    ? { balanceEtb: 2535, chargedEtb: 2535, approvedPaidEtb: 0, pendingEtb: 0, blocked: true }
    : { balanceEtb: 1500, chargedEtb: 2535, approvedPaidEtb: 1035, pendingEtb: 0, blocked: false };
}

async function primaryPaymentsLoader() {
  paymentCalls += 1;
  const call = paymentCalls;
  await delay(call === 1 ? 40 : 80);
  if (call === 1) throw new Error("temporary history failure");
  return [payment("primary-payment", "TX-PRIMARY-001")];
}

async function historyOnlySummaryLoader() {
  await delay(35);
  throw new Error("summary unavailable");
}

async function historyOnlyPaymentsLoader() {
  await delay(25);
  return [payment("secondary-payment", "TX-SECONDARY-001")];
}

async function openReceipt() {
  receiptCalls += 1;
  await delay(90);
  throw new Error("temporary receipt failure");
}

const noSubmit = async () => {};

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null,
    React.createElement("main", { className: "min-h-screen bg-[#f5f3ed] p-3 text-asphalt" },
      React.createElement("div", { id: "primary" },
        React.createElement(DriverCommissionWalletState, {
          loadSummary: primarySummaryLoader,
          loadPayments: primaryPaymentsLoader,
          submitPayment: noSubmit,
          openReceipt,
        })
      ),
      React.createElement("div", { id: "secondary" },
        React.createElement(DriverCommissionWalletState, {
          loadSummary: historyOnlySummaryLoader,
          loadPayments: historyOnlyPaymentsLoader,
          submitPayment: noSubmit,
          openReceipt: async () => {},
        })
      )
    )
  )
);

async function verify() {
  await waitFor(
    () => document.querySelector('#primary [data-wallet-source-error="partial"]')
      && document.querySelector('#primary [data-summary-ready="true"]'),
    "primary partial failure",
  );
  await waitFor(
    () => document.querySelector('#secondary [data-wallet-source-error="partial"]')
      && document.querySelector('#secondary [data-commission-payment-id="secondary-payment"]'),
    "secondary history-only state",
  );

  const primaryText = document.querySelector("#primary")?.textContent ?? "";
  const initialSummaryVisible = primaryText.includes("2,535")
    && document.querySelector('#primary [data-commission-history-state="unavailable"]')
    && !primaryText.includes("No commission settlement submitted yet.");

  const secondary = document.querySelector("#secondary");
  const secondaryText = secondary?.textContent ?? "";
  const secondaryHistoryVisible = Boolean(
    secondary?.querySelector('[data-commission-payment-id="secondary-payment"]')
    && secondaryText.includes("TX-SECONDARY-001")
    && secondary?.querySelector('[data-balance-state="unavailable"]')
    && secondary?.querySelector("fieldset")?.disabled
    && !secondaryText.includes("No commission settlement submitted yet.")
  );

  const primaryRetry = document.querySelector('#primary [data-wallet-source-error="partial"] button');
  primaryRetry?.click();
  primaryRetry?.click();

  await waitFor(
    () => paymentCalls === 2
      && document.querySelector('#primary [data-commission-payment-id="primary-payment"]')
      && document.querySelector('#primary [data-wallet-source-error="partial"]'),
    "guarded retry with preserved summary",
  );

  const afterSecondText = document.querySelector("#primary")?.textContent ?? "";
  const retryCallsGuarded = summaryCalls === 2 && paymentCalls === 2;
  const summaryPreserved = afterSecondText.includes("2,535")
    && afterSecondText.includes("TX-PRIMARY-001")
    && afterSecondText.includes("temporary summary failure");

  document.querySelector('#primary [data-wallet-source-error="partial"] button')?.click();
  await waitFor(
    () => summaryCalls === 3
      && paymentCalls === 3
      && !document.querySelector('#primary [data-wallet-source-error]')
      && (document.querySelector("#primary")?.textContent ?? "").includes("1,500"),
    "full recovery",
  );

  const receiptButton = document.querySelector('#primary [data-commission-payment-id="primary-payment"] button');
  receiptButton?.click();
  receiptButton?.click();
  await waitFor(
    () => (document.querySelector("#primary")?.textContent ?? "").includes("temporary receipt failure"),
    "receipt error",
  );

  const recovered = summaryCalls === 3
    && paymentCalls === 3
    && (document.querySelector("#primary")?.textContent ?? "").includes("1,500")
    && !document.querySelector('#primary [data-wallet-source-error]');
  const receiptGuarded = receiptCalls === 1;
  const receiptError = (document.querySelector("#primary")?.textContent ?? "").includes("temporary receipt failure");
  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth
    || document.body.scrollWidth > document.body.clientWidth;

  document.documentElement.dataset.initialSummaryVisible = String(Boolean(initialSummaryVisible));
  document.documentElement.dataset.secondaryHistoryVisible = String(secondaryHistoryVisible);
  document.documentElement.dataset.retryCallsGuarded = String(retryCallsGuarded);
  document.documentElement.dataset.summaryPreserved = String(summaryPreserved);
  document.documentElement.dataset.recovered = String(recovered);
  document.documentElement.dataset.receiptGuarded = String(receiptGuarded);
  document.documentElement.dataset.receiptError = String(receiptError);
  document.documentElement.dataset.overflow = String(overflow);
  document.documentElement.dataset.ready = "true";
}

void verify().catch((error) => {
  document.documentElement.dataset.fixtureError = error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.ready = "error";
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
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver commission wallet fixture bundle failed.");

  await writeFile(
    htmlFile,
    `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-commission-wallet-e2e.js"></script></body></html>`,
    "utf8",
  );
}

await prepareFixture();
const preview = spawn(bin("vite"), ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const dom = await render(chrome, { width, height: 1800 });
    for (const expected of [
      'data-ready="true"',
      'data-initial-summary-visible="true"',
      'data-secondary-history-visible="true"',
      'data-retry-calls-guarded="true"',
      'data-summary-preserved="true"',
      'data-recovered="true"',
      'data-receipt-guarded="true"',
      'data-receipt-error="true"',
      'data-overflow="false"',
    ]) {
      if (!dom.includes(expected)) {
        const fixtureError = dom.match(/data-fixture-error="([^"]*)"/)?.[1];
        throw new Error(`Driver commission wallet ${width}px smoke is missing: ${expected}${fixtureError ? `; fixture error: ${fixtureError}` : ""}`);
      }
    }
  }
  console.log("Driver commission wallet browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with independent source recovery, guarded Retry, preserved confirmed data, guarded receipt opening and no horizontal overflow.");
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
