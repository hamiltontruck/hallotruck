import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4193;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const vite = path.join(root, "node_modules/.bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuild = path.join(root, "node_modules/.bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const temp = path.join(root, ".admin-driver-compliance-e2e");
const entry = path.join(temp, "entry.mjs");
const bundle = path.join(root, "dist/admin-driver-compliance-e2e.js");
const html = path.join(root, "dist/admin-driver-compliance-e2e.html");

function chromeBinary() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Admin Driver Compliance preview server did not start.");
}

function render(chrome, width, profile) {
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},1200`, "--virtual-time-budget=4000", `--user-data-dir=${profile}`, "--dump-dom", `${baseUrl}admin-driver-compliance-e2e.html`], { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin Driver Compliance at ${width}px.`);
}

await mkdir(temp, { recursive: true });
const css = (await readdir(path.join(root, "dist/assets"))).find((name) => /^index-.*\.css$/.test(name));
if (!css) throw new Error("Built application CSS not found.");
const now = new Date().toISOString();
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AdminDriverCompliance } from ${JSON.stringify(path.join(root, "src/pages/AdminDriverCompliance.tsx"))};
const fixture = {
  drivers: [{ id:"driver-1", full_name:"Abiyu Nagash Enterprise Driver", phone:"+251911000000", email:"driver@example.com", home_address:"Adama", driver_status:"pending" }, { id:"driver-approved", full_name:"Approved Replacement Driver", phone:"+251922000000", email:"approved@example.com", home_address:"Addis Ababa", driver_status:"approved" }],
  trucks: [{id:"truck-approved",driver_id:"driver-approved",plate_number:"AA-2214",vehicle_type:"Isuzu 5 Ton",model:"FSR",capacity_tons:5,status:"available"}],
  documents: [{ id:"doc-approved-pending", driver_id:"driver-approved", truck_id:null, document_key:"license_front", file_path:"driver-approved/identity/license_front/replacement.jpg", original_name:"replacement.jpg", mime_type:"image/jpeg", expiry_date:"2027-12-31", status:"pending", rejection_reason:null, reviewed_at:null, created_at:${JSON.stringify(now)}, updated_at:${JSON.stringify(now)} }, ...["driver_photo","license_back","national_id_front","national_id_back","vehicle_registration","truck_front","truck_side"].map((key,index)=>({id:key,driver_id:"driver-approved",truck_id:index<4?null:"truck-approved",document_key:key,file_path:key,original_name:key+".jpg",mime_type:key==="vehicle_registration"?"application/pdf":"image/jpeg",expiry_date:key==="national_id_front"?"2028-06-30":null,status:"verified",rejection_reason:null,reviewed_at:null,created_at:${JSON.stringify(now)},updated_at:${JSON.stringify(now)}}))],
  history: [],
  orders: [{ id:"order-1", tracking_id:"HT-2026-ACTIVE-001", driver_id:"driver-1", truck_id:null, pickup_address:"Adama", dropoff_address:"Addis Ababa", vehicle_type:"Dry Cargo", price_etb:75700, status:"accepted", payment_status:"pending", accepted_at:${JSON.stringify(now)}, delivered_at:null, created_at:${JSON.stringify(now)} }],
  payments: [],
  historyAvailable: true
};
function App(){return React.createElement(HashRouter,null,React.createElement(AdminDriverCompliance,{fixture,resolveDocumentPreview:async()=>"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#e8eef8"/><text x="20" y="65" fill="#123262">Test document preview</text></svg>')}));}
createRoot(document.getElementById("root")).render(React.createElement(App));
await new Promise((resolve)=>setTimeout(resolve,300));
const rootNode=document.documentElement;
const groups=[...document.querySelectorAll('.driver-document-grid')];
rootNode.dataset.groups=String(groups.every((grid)=>grid.querySelectorAll('.driver-document-group').length===5));
rootNode.dataset.compact=String([...document.querySelectorAll('.driver-document-group')].every((card)=>card.getBoundingClientRect().height<=180));
rootNode.dataset.metadataHidden=String(groups.every((grid)=>!grid.textContent.includes('.jpg')&&!grid.textContent.includes('Open original')));
const trigger=groups[1].querySelector('[aria-label="View Driving license · Front"]');
trigger.focus();trigger.click();
await new Promise((resolve)=>setTimeout(resolve,100));
const dialog=document.querySelector('dialog[open]');
rootNode.dataset.details=String(!!dialog&&dialog.textContent.includes('replacement.jpg')&&dialog.textContent.includes('2027-12-31'));
rootNode.dataset.modalOverflow=String(dialog.scrollWidth>dialog.clientWidth);
const back=[...dialog.querySelectorAll('.driver-document-tabs button')].find((button)=>button.textContent==='Back');back.click();
await new Promise((resolve)=>setTimeout(resolve,100));
rootNode.dataset.back=String(dialog.textContent.includes('license_back.jpg')&&!dialog.textContent.includes('License expiry'));
dialog.querySelector('[aria-label="Close document details"]').click();
await new Promise((resolve)=>setTimeout(resolve,100));
rootNode.dataset.closed=String(!dialog.open&&document.activeElement===trigger);
const idTrigger=groups[1].querySelector('[aria-label="View National ID · Front"]');
idTrigger.focus();idTrigger.click();
await new Promise((resolve)=>setTimeout(resolve,100));
const idDialog=document.querySelector('dialog[open]');
rootNode.dataset.idExpiry=String(idDialog.textContent.includes('National ID expiry')&&idDialog.textContent.includes('2028-06-30')&&!idDialog.textContent.includes('License expiry'));
[...idDialog.querySelectorAll('.driver-document-tabs button')].find((button)=>button.textContent==='Back').click();
await new Promise((resolve)=>setTimeout(resolve,100));
rootNode.dataset.idBack=String(idDialog.textContent.includes('national_id_back.jpg')&&!idDialog.textContent.includes('National ID expiry'));
idDialog.querySelector('[aria-label="Close document details"]').click();
await new Promise((resolve)=>setTimeout(resolve,100));
rootNode.dataset.overflow=String(rootNode.scrollWidth>rootNode.clientWidth||document.body.scrollWidth>document.body.clientWidth);
document.documentElement.dataset.ready="true";
`;
await writeFile(entry, fixtureSource, "utf8");
const built = spawnSync(esbuild, [entry, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundle}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
if (built.status !== 0) throw new Error(built.stderr || "Admin Driver Compliance fixture bundle failed.");
await writeFile(html, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${css}"></head><body><div id="root"></div><script type="module" src="./admin-driver-compliance-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(vite, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer();
  const chrome = chromeBinary();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-driver-compliance-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"', 'data-overflow="false"', "Driver operations &amp; verification", "Cannot approve yet: Waiting for driver documents.", "Cannot remove while active trip HT-2026-ACTIVE-001 is accepted.", "Approved Replacement Driver", 'data-groups="true"', 'data-compact="true"', 'data-metadata-hidden="true"', 'data-details="true"', 'data-modal-overflow="false"', 'data-back="true"', 'data-closed="true"', 'data-id-expiry="true"', 'data-id-back="true"']) {
        if (!dom.includes(expected)) throw new Error(`Admin Driver Compliance ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
  console.log("Admin Driver Compliance browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with visible disabled-action guidance.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(temp, { recursive: true, force: true }), rm(bundle, { force: true }), rm(html, { force: true })]);
}
