import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4188;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".partner-settlement-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "partner-settlement-e2e.js");
const htmlFile = path.join(root, "dist", "partner-settlement-e2e.html");

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
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profile) {
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},1100`, "--virtual-time-budget=3000", `--user-data-dir=${profile}`, "--dump-dom", `${baseUrl}partner-settlement-e2e.html`];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Partner settlement workflow at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");
const now = new Date().toISOString();
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { AdminPartnerSettlementWorkflow } from ${JSON.stringify(path.join(root, "src", "components", "partner", "AdminPartnerSettlementWorkflow.tsx"))};
const now = ${JSON.stringify(now)};
const base = { partner_id:'partner-fixture', project_id:'project-1', request_key:'request-fixture', amount_etb:250000, provider:null, transaction_ref:null, receipt_path:null, note:'Verified corridor freight', approval_notes:null, rejection_reason:null, reviewed_by:null, reviewed_at:null, approved_by:null, approved_at:null, rejected_by:null, rejected_at:null, paid_at:null, created_at:now };
const settlements = [
  { ...base, id:'pending-1', settlement_reference:'HPS-2026-000001', status:'pending' },
  { ...base, id:'review-1', settlement_reference:'HPS-2026-000002', status:'under_review', reviewed_by:'admin-1', reviewed_at:now },
  { ...base, id:'approved-1', settlement_reference:'HPS-2026-000003', status:'approved', approval_notes:'Approved after freight reconciliation', approved_by:'admin-1', approved_at:now },
  { ...base, id:'partial-1', settlement_reference:'HPS-2026-000004', status:'partially_paid', approval_notes:'Approved for staged payment', approved_by:'admin-1', approved_at:now },
  { ...base, id:'paid-1', settlement_reference:'HPS-2026-000005', status:'paid', amount_etb:100000, paid_at:now },
];
const payments = [
  { id:'payment-1', request_key:'payment-request-1', settlement_id:'partial-1', partner_id:'partner-fixture', amount_etb:100000, payment_method:'bank_transfer', provider:'CBE', transaction_ref:'CBE-PARTIAL-001', paid_at:now, recorded_by:'admin-1', created_at:now },
  { id:'payment-2', request_key:'payment-request-2', settlement_id:'paid-1', partner_id:'partner-fixture', amount_etb:100000, payment_method:'mobile_money', provider:'Telebirr', transaction_ref:'TEL-PAID-001', paid_at:now, recorded_by:'admin-1', created_at:now },
];
const events = settlements.map((settlement, index) => ({ id:index+1, settlement_id:settlement.id, partner_id:'partner-fixture', event_type:settlement.status==='partially_paid'?'partially_paid':settlement.status, from_status:null, to_status:settlement.status, amount_etb:settlement.amount_etb, reason:null, actor_id:'admin-1', metadata:{}, created_at:now }));
createRoot(document.getElementById('root')).render(React.createElement('main', { className:'mx-auto min-w-0 max-w-6xl p-3 sm:p-6' }, React.createElement(AdminPartnerSettlementWorkflow, { partnerId:'partner-fixture', projects:[{ id:'project-1', partner_id:'partner-fixture', name:'Enterprise Corridor Project', status:'active' }], settlements, payments, events, corrections:[], busy:false, runAction:async()=>true })));
await new Promise((resolve) => setTimeout(resolve, 200));
document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
document.documentElement.dataset.ready = 'true';
`;
await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Partner settlement fixture bundle failed.");
await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./partner-settlement-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-partner-settlement-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"', 'data-overflow="false"', "Create pending settlement", "Start review", "Approve", "Reject", "Record payment", "Reverse settlement", "partially paid", "Outstanding ETB 150,000"]) {
        if (!dom.includes(expected)) throw new Error(`Partner settlement ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Partner settlement browser smoke passed at 320px, 360px, 390px and 412px with no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
