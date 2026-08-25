import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4180;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-intelligence-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-intelligence-e2e.js");
const htmlFile = path.join(root, "dist", "admin-intelligence-e2e.html");

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
    `--user-data-dir=${profileDirectory}`, "--dump-dom", `${baseUrl}admin-intelligence-e2e.html`,
  ];
  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [headlessFlag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin intelligence at ${viewport.width}px.`);
}

function assertContains(dom, expected, label) {
  for (const value of expected) if (!dom.includes(value)) throw new Error(`${label} is missing expected text: ${value}`);
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
import { AdminIntelligence } from ${JSON.stringify(path.join(root, "src", "pages", "AdminIntelligence.tsx"))};

const now = new Date().toISOString();
const order = (overrides = {}) => ({
  id: "order-1", tracking_id: "HT-NEXTGEN-001", customer_name: "Sofi Husse", customer_phone: "+251913509926",
  pickup_address: "Addis Ababa", dropoff_address: "Dire Dawa", cargo_description: "Coffee", vehicle_type: "Dry Cargo",
  price_etb: 72350, status: "delivered", payment_status: "released", driver_id: "driver-1", truck_id: "truck-1",
  accepted_at: now, delivered_at: now, cancellation_reason: null, cancellation_source: null, cancelled_at: null, created_at: now,
  ...overrides,
});
const fixture = {
  orders: [
    order(),
    order({ id: "order-2", tracking_id: "HT-NEXTGEN-002", customer_name: "Ali", status: "placed", payment_status: "pending", driver_id: null, truck_id: null, pickup_address: "Mojo", dropoff_address: "Adama" }),
  ],
  customers: [{ id: "customer-1", full_name: "Sofi Husse", phone: "+251913509926", email: "sofi@example.com", company_name: "Sofi Logistics", is_credit_customer: true, created_at: now }],
  drivers: [{ id: "driver-1", full_name: "Mebruk", phone: "+251911766093", driver_status: "approved" }],
  trucks: [{ id: "truck-1", plate_number: "3-A12345", vehicle_type: "Dry Cargo", capacity_tons: 12, status: "assigned", created_at: now }],
  payments: [
    { id: "payment-1", order_id: "order-1", provider: "telebirr", provider_ref: "TEL-NEXTGEN-001", amount_etb: 72350, event: "released", receipt_path: "receipt.jpg", created_at: now },
    { id: "payment-2", order_id: "order-2", provider: "cbe", provider_ref: "CBE-PENDING-001", amount_etb: 20000, event: "initiated", receipt_path: null, created_at: now },
  ],
};

createRoot(document.getElementById("root")).render(
  React.createElement(MemoryRouter, null, React.createElement(AdminIntelligence, { fixture })),
);

await new Promise((resolve) => setTimeout(resolve, 250));
const input = document.querySelector('input[type="search"]');
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
setter.call(input, "TEL-NEXTGEN-001");
input.dispatchEvent(new Event("input", { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 250));

document.documentElement.dataset.searchLink = String(Boolean(document.querySelector('a[href*="/admin/payment-review?q=TEL-NEXTGEN-001"]')));
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth
  || document.body.scrollWidth > document.body.clientWidth
);
document.documentElement.dataset.ready = "true";
`;

  await writeFile(entryFile, fixtureSource, "utf8");
  const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin intelligence fixture bundle failed.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-intelligence-e2e.js"></script></body></html>`, "utf8");
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
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-intelligence-e2e-"));
    try {
      const dom = render(chrome, { width, height: 915 }, profile);
      assertContains(dom, [
        'data-ready="true"', 'data-search-link="true"', 'data-overflow="false"',
        "Search everything.", "Global search", "TEL-NEXTGEN-001", "matching records",
        "Net revenue", "SMART SIGNALS", "7-DAY REVENUE PULSE", "Top routes",
        "Payment providers", "ETB 72,350",
      ], `Admin intelligence ${width}px smoke`);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Admin Intelligence browser smoke passed at 320px, 360px, 390px and 412px with global search, actionable reports and no horizontal overflow.");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
