import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4179;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-dashboard-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-dashboard-e2e.js");
const htmlFile = path.join(root, "dist", "admin-dashboard-e2e.html");

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

function render(chrome, viewport, profileDirectory) {
  const args = [
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking",
    "--disable-default-apps", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    `--window-size=${viewport.width},${viewport.height}`, "--virtual-time-budget=8000",
    `--user-data-dir=${profileDirectory}`, "--dump-dom", `${baseUrl}admin-dashboard-e2e.html`,
  ];
  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [headlessFlag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render the Admin dashboard at ${viewport.width}px.`);
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
import { MemoryRouter } from "react-router-dom";
import { AdminCeoOverview } from ${JSON.stringify(path.join(root, "src", "pages", "AdminCeoOverview.tsx"))};

const now = new Date();
const today = now.toISOString();
const delayed = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
const order = (overrides = {}) => ({
  id: "order-1", tracking_id: "HT-2026-" + "X".repeat(72), customer_name: "Sofi Husse",
  pickup_address: "Addis Ababa Bole International Airport, Ethiopia", dropoff_address: "Dire Dawa, Ethiopia",
  status: "placed", payment_status: "unpaid", driver_id: null, truck_id: null,
  accepted_at: null, delivered_at: null, created_at: today, ...overrides,
});
const payment = (overrides = {}) => ({
  id: "payment-1", order_id: "order-legacy", provider: "telebirr",
  provider_ref: "TEL-" + "9".repeat(90), amount_etb: 72350, event: "released",
  receipt_path: null, raw_payload: null, created_at: today, ...overrides,
});

const fixture = {
  orders: [
    order(),
    order({ id: "order-delayed", tracking_id: "HT-DELAYED", status: "in_transit", driver_id: "driver-1", truck_id: "truck-1", accepted_at: delayed, created_at: delayed }),
    order({ id: "order-legacy", tracking_id: "HT-LEGACY", status: "delivered", payment_status: "released", driver_id: "driver-1", truck_id: "truck-1", delivered_at: today }),
    order({ id: "order-evidence", tracking_id: "HT-EVIDENCE", status: "delivered", payment_status: "released", driver_id: "driver-1", truck_id: "truck-1", delivered_at: today }),
  ],
  payments: [
    payment({ raw_payload: { legacy_completed: true } }),
    payment({ id: "payment-pending", order_id: "order-evidence", provider_ref: "CBE-001", event: "initiated", amount_etb: 50000 }),
    payment({ id: "payment-escrow", order_id: "order-delayed", provider_ref: "AWASH-001", event: "held_escrow", amount_etb: 20000 }),
  ],
  trucks: [{ id: "truck-1", plate_number: "3-A12345", status: "available" }],
  drivers: [{ id: "driver-1", full_name: "Mebruk", driver_status: "pending" }],
  customers: [{ id: "customer-1", created_at: today }],
  proofs: [],
  documents: [],
  driverFinancialSummaries: [{
    driver_id: "driver-1", completed_trips: 1, gross_released_etb: 72350,
    commission_charged_etb: 18678, commission_paid_etb: 15678,
    admin_deposit_etb: 100000, available_deposit_etb: 99594, commission_due_etb: 3000,
  }],
};

createRoot(document.getElementById("root")).render(
  React.createElement(MemoryRouter, null, React.createElement(AdminCeoOverview, { fixture })),
);

await new Promise((resolve) => setTimeout(resolve, 300));
document.documentElement.dataset.kpiLinks = String(
  Boolean(document.querySelector('a[href="/admin/operations?section=Orders"]'))
  && Boolean(document.querySelector('a[href="/admin/driver-finance-search"]'))
);
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth
  || document.body.scrollWidth > document.body.clientWidth
);
document.documentElement.dataset.ready = "true";
`;

  await writeFile(entryFile, fixtureSource, "utf8");
  const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin dashboard fixture bundle failed.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-dashboard-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let previewOutput = "";
preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-dashboard-e2e-"));
    try {
      const dom = render(chrome, { width, height: 915 }, profile);
      assertContains(dom, [
        'data-ready="true"', 'data-kpi-links="true"', 'data-overflow="false"',
        "Total Orders", "Unassigned Orders", "Legacy Completed", "Commission Receivable",
        "Available Driver Deposits", "ETB 99,594", "New Customers Today", "Quote pricing",
      ], `Admin dashboard ${width}px smoke`);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Admin Dashboard browser smoke passed at 320px, 360px, 390px and 412px with actionable KPIs and no horizontal overflow.");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
