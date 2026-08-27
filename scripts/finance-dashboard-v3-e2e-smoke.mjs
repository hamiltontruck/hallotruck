import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4185;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".finance-dashboard-v3-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "finance-dashboard-v3-e2e.js");
const htmlFile = path.join(root, "dist", "finance-dashboard-v3-e2e.html");

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
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},915`, "--virtual-time-budget=7000", `--user-data-dir=${profile}`, "--dump-dom", `${baseUrl}finance-dashboard-v3-e2e.html`];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 25 * 1024 * 1024, timeout: 30000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Finance Dashboard V3 at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { AdminFinanceDashboardV3 } from ${JSON.stringify(path.join(root, "src", "pages", "AdminFinanceDashboardV3.tsx"))};
const now = new Date().toISOString();
const fixture = {
 payments:[
  {id:'p1',order_id:'o1',provider:'cbe',provider_ref:'CBE-100',amount_etb:125000,event:'released',created_at:now,reviewed_at:now},
  {id:'p2',order_id:'o2',provider:'telebirr',provider_ref:'TEL-200',amount_etb:25000,event:'held_escrow',created_at:now,reviewed_at:null},
  {id:'p3',order_id:'o3',provider:'cbe',provider_ref:'CBE-R',amount_etb:5000,event:'refunded',created_at:now,reviewed_at:now},
  {id:'p4',order_id:'o4',provider:'cbe',provider_ref:null,amount_etb:4000,event:'failed',created_at:now,reviewed_at:null},
 ],
 orders:[
  {id:'o1',tracking_id:'HT-FIN-001',customer_id:'c1',customer_name:'Sofi Husse',driver_id:'d1',truck_id:'t1',pickup_address:'Addis Ababa',dropoff_address:'Dire Dawa',vehicle_type:'Dry Cargo',price_etb:125000,status:'delivered',payment_status:'released',created_at:now},
  {id:'o2',tracking_id:'HT-FIN-002',customer_id:'c1',customer_name:'Sofi Husse',driver_id:'d1',truck_id:'t1',pickup_address:'Mojo',dropoff_address:'Adama',vehicle_type:'Dry Cargo',price_etb:25000,status:'in_transit',payment_status:'held_escrow',created_at:now},
  {id:'o3',tracking_id:'HT-FIN-003',customer_id:'c1',customer_name:'Sofi Husse',driver_id:'d1',truck_id:'t1',pickup_address:'Addis Ababa',dropoff_address:'Adama',vehicle_type:'Flatbed',price_etb:5000,status:'cancelled',payment_status:'refunded',created_at:now},
  {id:'o4',tracking_id:'HT-FIN-004',customer_id:'c1',customer_name:'Sofi Husse',driver_id:'d1',truck_id:'t1',pickup_address:'Adama',dropoff_address:'Dessie',vehicle_type:'Flatbed',price_etb:4000,status:'placed',payment_status:'unpaid',created_at:now},
 ],
 profiles:[{id:'d1',full_name:'Abiyu Nagash',phone:'+251911992609',email:'abiy@gmail.com',role:'driver'},{id:'c1',full_name:'Sofi Husse',phone:'+251913509926',email:'sofi@example.com',role:'customer'}],
 deposits:[{id:'dep1',driver_id:'d1',amount_etb:10000,status:'active',created_at:now}],
 commissionCharges:[{id:'cc1',driver_id:'d1',order_id:'o1',payment_id:'p1',commission_etb:2500,status:'active',created_at:now}],
 commissionPayments:[],
 confirmations:[{payment_id:'p1',order_id:'o1',driver_id:'d1',commission_etb:2500,commission_reversed_at:null,commission_accrued_at:now}],
 corrections:[],
};
createRoot(document.getElementById('root')).render(React.createElement(AdminFinanceDashboardV3,{fixture}));
await new Promise(r=>setTimeout(r,300));
document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth);
document.documentElement.dataset.ready='true';
`;
await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Finance Dashboard V3 fixture bundle failed.");
await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./finance-dashboard-v3-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320,360,390,412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-finance-v3-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"','data-overflow="false"','Finance Dashboard V3','Today\'s revenue','Held escrow','Commission earned','SMART SIGNALS','Top routes','Payment providers','HT-FIN-001']) {
        if (!dom.includes(expected)) throw new Error(`Finance Dashboard V3 ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile,{recursive:true,force:true}); }
  }
  console.log("Finance Dashboard V3 browser smoke passed at 320px, 360px, 390px and 412px with no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve)=>preview.once("exit",resolve)),new Promise((resolve)=>setTimeout(resolve,2000))]);
  if (preview.exitCode===null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory,{recursive:true,force:true}),rm(bundleFile,{force:true}),rm(htmlFile,{force:true})]);
}
