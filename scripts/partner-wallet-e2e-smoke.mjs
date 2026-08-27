import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4187;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".partner-wallet-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "partner-wallet-e2e.js");
const htmlFile = path.join(root, "dist", "partner-wallet-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profile) {
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},915`, "--virtual-time-budget=3000", `--user-data-dir=${profile}`, "--dump-dom", `${baseUrl}partner-wallet-e2e.html`];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Partner Wallet at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");
const now = new Date().toISOString();
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PartnerWallet } from ${JSON.stringify(path.join(root, "src", "pages", "PartnerWallet.tsx"))};
const fixture = {
  partnerId: 'partner-fixture',
  name: 'Hamilton Group PLC Enterprise Logistics Partner',
  summary: { gross_etb: 1250000, hallo_commission_etb: 25000, partner_net_etb: 1225000, pending_settlement_etb: 250000, paid_settlement_etb: 400000, payable_etb: 575000, fleet_total: 512, fleet_available: 387, hallo_freight_count: 48 },
  earnings: [{ id:'earning-1', partner_id:'partner-fixture', order_id:'00000000-0000-0000-0000-VERY-LONG-ORDER-REFERENCE-1234567890', vehicle_id:null, gross_etb:1250000, commission_type:'percentage', commission_value:2, hallo_commission_etb:25000, partner_net_etb:1225000, status:'accrued', accrued_at:${JSON.stringify(now)} }],
  settlements: [{ id:'settlement-1', partner_id:'partner-fixture', amount_etb:250000, status:'pending', provider:'Commercial Bank of Ethiopia Enterprise Transfer', transaction_ref:'CBE-ENTERPRISE-TRANSACTION-REFERENCE-12345678901234567890', note:null, paid_at:null, created_at:${JSON.stringify(now)} }],
};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null, React.createElement(PartnerWallet, { fixture })));
await new Promise((resolve) => setTimeout(resolve, 200));
document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
document.documentElement.dataset.ready = 'true';
`;
await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Partner Wallet fixture bundle failed.");
await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./partner-wallet-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-partner-wallet-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"', 'data-overflow="false"', "Partner net", "Payable balance", "HALLO-generated freight", "Settlements", "ETB 575,000"]) {
        if (!dom.includes(expected)) throw new Error(`Partner Wallet ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
  console.log("Partner Wallet browser smoke passed at 320px, 360px, 390px and 412px with no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
