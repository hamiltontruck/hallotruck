import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4191;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const testDirectory = path.join(root, ".trip-completion-e2e");
const bundleFile = path.join(root, "dist", "trip-completion-e2e.js");
const htmlFile = path.join(root, "dist", "trip-completion-e2e.html");

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
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-trip-completion-e2e-"));
  try {
    const result = spawnSync(chrome, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=6000", `--user-data-dir=${profile}`, "--dump-dom",
      `${baseUrl}trip-completion-e2e.html`,
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
import React from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src/i18n/LanguageProvider.tsx"))};
import { TripCompletionProgress } from ${JSON.stringify(path.join(root, "src/components/trips/TripCompletionProgress.tsx"))};
import { DriverPaymentConfirmation } from ${JSON.stringify(path.join(root, "src/components/driver/DriverPaymentConfirmation.tsx"))};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const base = {
  order_id: "order-1", tracking_id: "HT-2026-FA5518", order_status: "delivered",
  payment_terms: "prepaid", invoice_total_etb: 75700,
  initiated_etb: 0, held_escrow_etb: 75700, released_etb: 0, refunded_etb: 0,
  verified_net_etb: 0, balance_due_etb: 75700, commission_charged_etb: 0,
  payment_state: "awaiting_driver_confirmation", delivery_proof_recorded: true, rating_score: null,
};
const released = { ...base, order_id: "order-2", released_etb: 75700,
  held_escrow_etb: 0, verified_net_etb: 75700, balance_due_etb: 0,
  commission_charged_etb: 1514, payment_state: "released", rating_score: 5 };
const payment = {
  payment_id: "payment-confirm", provider: "bank_of_abyssinia", provider_ref: "AV5689844_",
  amount_etb: 75700, payment_event: "held_escrow", confirmation_type: null,
  confirmation_reason: null, confirmed_at: null, released_at: null,
  order_status: "delivered", can_confirm: true, can_report_not_received: true,
};
const reportPayment = { ...payment, payment_id: "payment-report", provider_ref: "TB-REPORT-1" };
let confirmRows = [payment];
let reportRows = [reportPayment];
let confirmCalls = 0;
let reportCalls = 0;

const confirmServices = {
  getStatus: async () => confirmRows,
  confirm: async (paymentId) => {
    confirmCalls += 1;
    await delay(220);
    confirmRows = confirmRows.map((row) => row.payment_id === paymentId ? {
      ...row,
      confirmation_type: "payment_confirmed",
      confirmed_at: new Date().toISOString(),
      can_confirm: false,
      can_report_not_received: false,
    } : row);
  },
  reportNotReceived: async () => { throw new Error("Unexpected report service call"); },
};
const reportServices = {
  getStatus: async () => reportRows,
  confirm: async () => { throw new Error("Unexpected confirm service call"); },
  reportNotReceived: async (paymentId, reason) => {
    reportCalls += 1;
    await delay(220);
    reportRows = reportRows.map((row) => row.payment_id === paymentId ? {
      ...row,
      confirmation_type: "payment_not_received",
      confirmation_reason: reason,
      can_confirm: false,
      can_report_not_received: false,
    } : row);
  },
};

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null,
    React.createElement("main", { className: "mx-auto max-w-2xl px-3 py-4" },
      React.createElement(TripCompletionProgress, { orderId: base.order_id, audience: "driver", initialSummary: base }),
      React.createElement("div", { id: "confirm-case" },
        React.createElement(DriverPaymentConfirmation, { orderId: base.order_id, services: confirmServices })
      ),
      React.createElement("div", { id: "report-case" },
        React.createElement(DriverPaymentConfirmation, { orderId: "order-report", services: reportServices })
      ),
      React.createElement(TripCompletionProgress, { orderId: released.order_id, audience: "customer", initialSummary: released })
    )
  )
);

function buttonByText(root, value) {
  return [...root.querySelectorAll("button")].find((button) => (button.textContent ?? "").trim() === value);
}

async function runFixture() {
  try {
    await delay(80);
    const confirmCase = document.getElementById("confirm-case");
    const reportCase = document.getElementById("report-case");
    const confirmButton = buttonByText(confirmCase, "Payment confirmed");
    if (!confirmButton) throw new Error("Confirm action was not rendered");
    confirmButton.click();
    confirmButton.click();
    await delay(30);

    const confirmControl = confirmCase.querySelector("[data-driver-payment-confirmation]");
    const confirmButtons = [...confirmCase.querySelectorAll("button")];
    document.documentElement.dataset.confirmLocked = String(confirmButtons.every((button) => button.disabled));
    document.documentElement.dataset.paymentBusy = String(confirmControl?.getAttribute("aria-busy") === "true");
    await delay(300);

    const openReport = buttonByText(reportCase, "Payment not received / not confirmed");
    if (!openReport) throw new Error("Payment-not-received action was not rendered");
    openReport.click();
    await delay(30);
    const textarea = reportCase.querySelector("textarea");
    if (!textarea) throw new Error("Payment-not-received reason field was not rendered");
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    valueSetter?.call(textarea, "Transfer not visible in the assigned driver account.");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(30);

    const saveReport = buttonByText(reportCase, "Save payment-not-received status");
    if (!saveReport) throw new Error("Payment-not-received save action was not rendered");
    saveReport.click();
    saveReport.click();
    await delay(30);
    const reportButtons = [...reportCase.querySelectorAll("button")];
    const reportTextarea = reportCase.querySelector("textarea");
    document.documentElement.dataset.reportLocked = String(
      reportButtons.every((button) => button.disabled) && Boolean(reportTextarea?.disabled),
    );
    await delay(300);

    const normalizedText = (document.body.textContent ?? "").replace(/\\s/g, "");
    document.documentElement.dataset.confirmCalls = String(confirmCalls);
    document.documentElement.dataset.reportCalls = String(reportCalls);
    document.documentElement.dataset.paymentAmount = String(normalizedText.includes("75,700ETB"));
    document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
    document.documentElement.dataset.fileInput = String(Boolean(document.querySelector('input[type="file"]')));
    document.documentElement.dataset.ready = "true";
  } catch (error) {
    document.documentElement.dataset.fixtureError = error instanceof Error ? error.message : String(error);
    document.documentElement.dataset.ready = "false";
  }
}

void runFixture();
`;
  const entry = path.join(testDirectory, "entry.mjs");
  await writeFile(entry, source, "utf8");
  const bundled = spawnSync(bin("esbuild"), [entry, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Trip completion fixture bundle failed.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./trip-completion-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(bin("vite"), ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const dom = await render(chrome, { width, height: 1600 });
    const fixtureError = dom.match(/data-fixture-error="([^"]*)"/)?.[1] ?? "unavailable";
    for (const expected of [
      'data-ready="true"',
      'data-confirm-calls="1"',
      'data-report-calls="1"',
      'data-confirm-locked="true"',
      'data-report-locked="true"',
      'data-payment-busy="true"',
      'data-payment-amount="true"',
      'data-overflow="false"',
      'data-file-input="false"',
      "Trip completion",
      "Payment confirmation",
      "Customer payment amount",
      "Bank / Telebirr",
      "Bank of Abyssinia",
      "AV5689844_",
      "Assigned driver confirmed payment",
      "Transfer not visible in the assigned driver account",
      "Commission",
      "Complete",
    ]) {
      if (!dom.includes(expected)) {
        throw new Error(`Assigned-driver payment ${width}px smoke is missing: ${expected}; fixture error: ${fixtureError}`);
      }
    }
  }
  console.log("Assigned-driver payment action-lock smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with one confirm call, one not-received call, locked pending controls and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}