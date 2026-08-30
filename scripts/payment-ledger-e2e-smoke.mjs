import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4175;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".payment-ledger-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "payment-ledger-e2e.js");
const htmlFile = path.join(root, "dist", "payment-ledger-e2e.html");

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

function assertContains(dom, expected, label) {
  for (const value of expected) {
    if (!dom.includes(value)) throw new Error(`${label} is missing expected text: ${value}`);
  }
}

function assertNotContains(dom, unexpected, label) {
  for (const value of unexpected) {
    if (dom.includes(value)) throw new Error(`${label} contains forbidden text: ${value}`);
  }
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
    "--virtual-time-budget=8000",
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
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-payment-ledger-e2e-"));
  try {
    return dumpDom(chrome, `${baseUrl}payment-ledger-e2e.html`, profile, viewport);
  } finally {
    await rm(profile, { recursive: true, force: true });
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
import { MemoryRouter } from "react-router-dom";
import { AdminPaymentReview } from ${JSON.stringify(path.join(root, "src", "pages", "AdminPaymentReview.tsx"))};

const payments = Array.from({ length: 15 }, (_, index) => {
  const number = index + 1;
  const id = "payment-" + String(number).padStart(2, "0");
  const orderId = "order-" + String(number).padStart(2, "0");
  if (number === 1) return { id, order_id: orderId, provider: "cbe", provider_ref: "LEGACY-" + "X".repeat(80), amount_etb: 65500, event: "released", receipt_path: null, rejection_reason: null, reviewed_by: "admin-1", reviewed_at: "2026-08-09T01:00:41.000Z", raw_payload: { legacy_completed: true }, created_at: "2026-08-09T01:00:41.000Z" };
  if (number === 2) return { id, order_id: orderId, provider: "telebirr", provider_ref: "TX-OVER-0002", amount_etb: 65500, event: "initiated", receipt_path: null, rejection_reason: null, reviewed_by: null, reviewed_at: null, raw_payload: null, created_at: "2026-08-24T10:00:00.000Z" };
  if (number === 3) return { id, order_id: orderId, provider: "cbe", provider_ref: "TX-UNDER-0003", amount_etb: 20000, event: "initiated", receipt_path: "customer/receipt-3.png", rejection_reason: null, reviewed_by: null, reviewed_at: null, raw_payload: null, created_at: "2026-08-24T09:00:00.000Z" };
  if (number === 4) return { id, order_id: orderId, provider: "telebirr", provider_ref: "TX-CORRECTED-0004", amount_etb: 50000, event: "held_escrow", receipt_path: "customer/receipt-4.png", rejection_reason: null, reviewed_by: "admin-1", reviewed_at: "2026-08-24T08:30:00.000Z", raw_payload: null, created_at: "2026-08-24T08:30:00.000Z" };
  return { id, order_id: orderId, provider: number % 2 ? "cbe" : "telebirr", provider_ref: "TX-" + String(number).padStart(4, "0"), amount_etb: 50000, event: "released", receipt_path: "customer/receipt-" + number + ".png", rejection_reason: null, reviewed_by: "admin-1", reviewed_at: "2026-08-24T08:00:00.000Z", raw_payload: null, created_at: "2026-08-24T08:00:00.000Z" };
});

const orders = payments.map((payment, index) => ({
  id: payment.order_id,
  tracking_id: index === 0 ? "HT-2026-F44A0E" : "HT-2026-" + String(index + 1).padStart(6, "0"),
  customer_name: index === 0 ? "Sofi Husse With A Very Long Customer Name For Mobile Layout Verification" : "Customer " + (index + 1),
  customer_phone: "+251913509926",
  pickup_address: index === 0 ? "Hirna-West-Harerghe-" + "VeryLongUnbrokenPickupAddress".repeat(4) : "Addis Ababa, Ethiopia",
  dropoff_address: index === 0 ? "Dessie-South-Wollo-" + "VeryLongUnbrokenDropoffAddress".repeat(4) : "Adama, Ethiopia",
  price_etb: index === 0 ? 65500 : 50000,
  status: "delivered",
  driver_id: "driver-1",
}));

const fixture = {
  payments,
  orders,
  drivers: [{ id: "driver-1", full_name: "Adil Abdu With A Long Driver Display Name", phone: "+251900000001" }],
  audit: [
    { id: "audit-1", payment_id: "payment-01", action: "verified", actor_id: "12345678-aaaa-bbbb-cccc-123456789000", reason: null, created_at: "2026-08-09T01:02:00.000Z" },
    { id: "audit-2", payment_id: "payment-01", action: "resubmitted", actor_id: "12345678-aaaa-bbbb-cccc-123456789000", reason: "Historical receipt was reconciled during legacy migration.", created_at: "2026-08-09T01:01:00.000Z" },
  ],
  confirmations: [{ id: "confirmation-4", order_id: "order-04", assigned_driver_id: "driver-1", payment_id: "payment-04", confirmation_type: "payment_confirmed", confirmed_amount_etb: 30000, provider: "telebirr", provider_ref: "TX-CORRECTED-0004", reason: null, confirmed_at: "2026-08-24T09:00:00.000Z", actor_id: "driver-1" }],
  corrections: [{ id: "correction-4", source_payment_id: "payment-04", amount_etb: 20000, correction_type: "partial_refund", reason: "Verified partial customer refund", created_at: "2026-08-24T09:30:00.000Z" }],
  reconciliation: [{ order_id: "order-01", tracking_id: "HT-2026-F44A0E", route: "Hirna → Dessie", customer_shipper: "Sofi Husse", assigned_driver: "Adil Abdu", trip_amount_etb: 30000, payment_method: "cash", cash_collected_etb: 30000, bank_telebirr_received_etb: 0, hallo_commission_etb: 600, driver_gross_etb: 30000, driver_net_etb: 29400, deposit_consumed_etb: 600, remaining_available_deposit_etb: 9400, commission_due_etb: 0, completed_at: "2026-08-28T12:00:00.000Z", payment_status: "released", rating_status: "not_rated" }],
};

createRoot(document.getElementById("root")).render(React.createElement(MemoryRouter, { initialEntries: ["/admin/payment-review"] }, React.createElement(AdminPaymentReview, { fixture })));

setTimeout(() => {
  const legacyDetails = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("View details"));
  legacyDetails?.click();
  setTimeout(() => {
    const legacyText = document.body.textContent ?? "";
    const pendingDetails = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("View details"));
    pendingDetails?.click();
    setTimeout(() => {
      const reviewText = document.body.textContent ?? "";
      document.documentElement.dataset.legacyAuditVisible = String(legacyText.includes("Payment review audit") && legacyText.includes("Historical receipt was reconciled during legacy migration."));
      document.documentElement.dataset.reviewGuidanceVisible = String(reviewText.includes("Verification is locked until receipt evidence is uploaded for this payment.") && reviewText.includes("Enter at least 5 characters explaining why this payment is being rejected."));
      document.documentElement.dataset.viewport = String(window.innerWidth);
      document.documentElement.dataset.cardCount = String(document.querySelectorAll("article").length);
      document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
      document.documentElement.dataset.ready = "true";
    }, 250);
  }, 250);
}, 250);
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
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Payment ledger fixture bundle failed.");

  const css = await readFile(path.join(root, "dist", "assets", cssFile), "utf8");
  if (!css.includes("overflow-wrap:anywhere")) throw new Error("Mobile overflow protection was not emitted into the production CSS.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./payment-ledger-e2e.js"></script></body></html>`, "utf8");
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
  for (const width of [320, 360, 390, 412]) {
    const dom = await render(chrome, { width, height: 915 });
    const label = `Payment ledger ${width}px smoke`;
    assertContains(dom, [
      "data-ready=\"true\"",
      "data-card-count=\"13\"",
      "data-legacy-audit-visible=\"true\"",
      "data-review-guidance-visible=\"true\"",
      "data-overflow=\"false\"",
      "Payment ledger",
      "Completed trip finance and rating report",
      "Cash collected",
      "HALLO commission",
      "ETB 29,400",
      "ETB 9,400",
      "HT-2026-F44A0E",
      "Invoice mismatch",
      "Overpayment ETB 15,500",
      "Underpayment ETB 30,000",
      "Missing receipt",
      "Legacy completed",
      "Receipt exempt · legacy completed",
      "Verification is locked until receipt evidence is uploaded for this payment.",
      "Enter at least 5 characters explaining why this payment is being rejected.",
      "Immutable correction applied.",
      "Corrected ETB 20,000",
      "releasable ETB 30,000",
      "Release ETB 30,000",
      "Showing 1–12 of 15",
      "1 / 2",
    ], label);
    assertNotContains(dom, ["Evidence required"], label);
  }
  console.log("Payment Ledger browser smoke passed at 320px, 360px, 390px and 412px with indicators, audit history, pagination and no horizontal overflow.");
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
