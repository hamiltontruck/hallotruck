import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4191;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-operations-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-operations-e2e.js");
const htmlFile = path.join(root, "dist", "admin-operations-e2e.html");

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
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Admin Operations preview did not start in time.");
}

function render(chrome, width, profileDirectory, route) {
  const target = `${baseUrl}admin-operations-e2e.html?route=${encodeURIComponent(route)}`;
  const args = [
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
    `--window-size=${width},915`, "--virtual-time-budget=4000",
    `--user-data-dir=${profileDirectory}`, "--dump-dom", target,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin Operations at ${width}px.`);
}

function assertContains(dom, values, label) {
  for (const value of values) {
    if (!dom.includes(value)) throw new Error(`${label} is missing: ${value}`);
  }
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS was not found.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { SmartLogistics } from ${JSON.stringify(path.join(root, "src", "pages", "SmartLogistics.tsx"))};

const route = new URLSearchParams(window.location.search).get("route") || "/admin/operations";
const now = new Date().toISOString();
const fixture = {
  metrics: { totalOrders: 3, activeOrders: 1, deliveredOrders: 1, availableTrucks: 1, totalCustomers: 1, revenueEtb: 75000 },
  orders: [
    { id: "order-placed", tracking_id: "HT-PLACED", customer_name: "Sofi", customer_phone: "0911000000", pickup_address: "Addis Ababa", dropoff_address: "Dire Dawa", cargo_description: "Coffee", vehicle_type: "Dry cargo", price_etb: 50000, status: "placed", payment_status: "unpaid", payment_terms: "pay_driver_on_delivery", driver_id: null, truck_id: null, created_at: now },
    { id: "order-delivered", tracking_id: "HT-DELIVERED", customer_name: "Hana", customer_phone: "0922000000", pickup_address: "Adama", dropoff_address: "Addis Ababa", cargo_description: "Steel", vehicle_type: "Flatbed", price_etb: 75000, status: "delivered", payment_status: "released", payment_terms: "prepaid", driver_id: "driver-approved", truck_id: "truck-available", created_at: now, delivered_at: now },
    { id: "order-active", tracking_id: "HT-ACTIVE", customer_name: "Bekele", customer_phone: "0933000000", pickup_address: "Jijiga", dropoff_address: "Hargeisa", cargo_description: "Food", vehicle_type: "Dry cargo", price_etb: 60000, status: "in_transit", payment_status: "held_escrow", payment_terms: "prepaid", driver_id: "driver-pending", truck_id: "truck-maintenance", created_at: now, accepted_at: now },
  ],
  customers: [{ id: "customer-1", full_name: "Sofi", phone: "0911000000", email: "sofi@example.com", company_name: "Sofi PLC", is_credit_customer: false, created_at: now }],
  trucks: [
    { id: "truck-available", plate_number: "3-A12345", vehicle_type: "Dry cargo", capacity_tons: 25, status: "available" },
    { id: "truck-maintenance", plate_number: "3-B98765", vehicle_type: "Flatbed", capacity_tons: 30, status: "maintenance" },
  ],
  payments: [
    { id: "payment-released", order_id: "order-delivered", provider: "telebirr", provider_ref: "TEL-001", amount_etb: 75000, event: "released", receipt_path: null, raw_payload: null, created_at: now },
    { id: "payment-pending", order_id: "order-placed", provider: "cbe", provider_ref: "CBE-001", amount_etb: 50000, event: "initiated", receipt_path: null, raw_payload: null, created_at: now },
  ],
  drivers: [
    { id: "driver-approved", full_name: "Adil Abdu", phone: "0911111111", email: "adil@example.com", driver_status: "approved" },
    { id: "driver-pending", full_name: "Mebruk Ali", phone: "0922222222", email: "mebruk@example.com", driver_status: "pending" },
  ],
  deliveryProofs: [],
};

createRoot(document.getElementById("root")).render(
  React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(SmartLogistics, { fixture })),
);

await new Promise((resolve) => setTimeout(resolve, 300));
const links = [...document.querySelectorAll("a")];
const pressed = [...document.querySelectorAll('[aria-pressed="true"]')];
const input = document.querySelector('input[aria-label="Search operations"], input[aria-label^="Search "]');
document.documentElement.dataset.kpis = String(
  ["section=Orders", "fleet_status=available", "status=delivered", "payment_status=released"]
    .every((value) => links.some((link) => link.getAttribute("href")?.includes(value))),
);
document.documentElement.dataset.pressed = String(pressed.length);
document.documentElement.dataset.search = input?.value || "";
document.documentElement.dataset.current = String(document.querySelectorAll('#admin-operations-menu [aria-current="page"]').length);
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth
    || document.body.scrollWidth > document.body.clientWidth,
);
document.documentElement.dataset.ready = "true";
`;

await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [
  entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120",
  `--outfile=${bundleFile}`,
  "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
  "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin Operations fixture bundle failed.");
await writeFile(
  htmlFile,
  `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-operations-e2e.js"></script></body></html>`,
  "utf8",
);

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-operations-"));
    try {
      const dom = render(chrome, width, profile, "/admin/operations");
      assertContains(dom, [
        'data-ready="true"', 'data-kpis="true"', 'data-current="1"', 'data-overflow="false"',
        "Total orders", "Available trucks", "Delivered orders", "Released revenue",
      ], `Admin Operations overview ${width}px`);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }

  const cases = [
    ["/admin/operations?section=Orders&status=delivered&q=HT-DELIVERED", 1, "HT-DELIVERED", ["Matching orders", "HT-DELIVERED"]],
    ["/admin/operations?section=Fleet%20%26%20drivers&fleet_status=available&driver_status=approved", 2, "", ["Matching fleet", "Matching drivers", "3-A12345", "Adil Abdu"]],
    ["/admin/operations?section=Finance&payment_status=released", 1, "", ["Matching payments", "TEL-001"]],
  ];
  for (const [route, pressedCount, search, text] of cases) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-operations-filter-"));
    try {
      const dom = render(chrome, 390, profile, route);
      assertContains(dom, [
        'data-ready="true"', `data-pressed="${pressedCount}"`, `data-search="${search}"`,
        'data-current="1"', 'data-overflow="false"', ...text,
      ], String(route));
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }

  console.log("Admin Operations browser smoke passed at 320px–430px and tablet width with actionable KPIs, URL-restored filters, accessible active states and no overflow.");
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
