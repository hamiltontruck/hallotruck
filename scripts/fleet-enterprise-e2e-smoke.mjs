import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4192;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const vite = path.join(root, "node_modules/.bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuild = path.join(root, "node_modules/.bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const temp = path.join(root, ".fleet-enterprise-e2e");
const entry = path.join(temp, "entry.mjs");
const bundle = path.join(root, "dist/fleet-enterprise-e2e.js");
const html = path.join(root, "dist/fleet-enterprise-e2e.html");

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
  throw new Error("Fleet preview server did not start.");
}

function render(chrome, width, profile) {
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},1200`, "--virtual-time-budget=4000", `--user-data-dir=${profile}`, "--dump-dom", `${baseUrl}fleet-enterprise-e2e.html`], { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Fleet Enterprise at ${width}px.`);
}

await mkdir(temp, { recursive: true });
const css = (await readdir(path.join(root, "dist/assets"))).find((name) => /^index-.*\.css$/.test(name));
if (!css) throw new Error("Built application CSS not found.");
const now = new Date().toISOString();
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { AdminFleetMaintenance } from ${JSON.stringify(path.join(root, "src/pages/AdminFleetMaintenance.tsx"))};
import { PartnerFleetPanel } from ${JSON.stringify(path.join(root, "src/components/partner/PartnerFleetPanel.tsx"))};
const vehicle = { vehicle_id:"truck-1",partner_vehicle_id:"partner-vehicle-1",partner_id:"partner-1",plate_number:"ET-01-VERY-LONG-PLATE-12345",vehicle_type:"Heavy duty refrigerated enterprise cargo vehicle",capacity_tons:32,status:"on_trip",ownership_type:"partner",fuel_type:"diesel",branch_id:"branch-1",branch_name:"Addis Ababa Enterprise Operations Branch",assigned_driver_id:"driver-1",assigned_driver_name:"Abiyu Nagash Enterprise Driver",active_trip_id:"trip-1",active_trip_reference:"HT-2026-ENTERPRISE-TRIP-REFERENCE-1234567890",active_trip_status:"in_transit",current_odometer_km:145789,insurance_expiry:"2026-09-01",license_expiry:"2026-12-01",roadworthiness_expiry:"2026-08-26",last_service_date:"2026-07-01",next_service_date:"2026-09-05",maintenance_status:"scheduled",health_status:"critical",dispatch_ready:false,gps_provider:"Future GPS Adapter",last_location_at:${JSON.stringify(now)},updated_at:${JSON.stringify(now)} };
const fixture = { vehicles:[vehicle],summary:{total:1,available:0,assigned:0,on_trip:1,maintenance:0,suspended:0,inactive:0,expiry_alerts:2,service_alerts:1,dispatch_ready:0},records:[{id:"maintenance-1",truck_id:"truck-1",maintenance_type:"scheduled_service",status:"scheduled",service_date:"2026-09-05",odometer_km:145789,cost_etb:125000,vendor:"Enterprise Fleet Workshop",notes:"Complete scheduled service and roadworthiness renewal",next_service_date:"2026-12-05",next_service_odometer_km:160000,created_at:${JSON.stringify(now)},updated_at:${JSON.stringify(now)}}],branches:[{id:"branch-1",partner_id:null,name:"Addis Ababa Enterprise Operations Branch",code:"ADDIS-01",address:"Addis Ababa",active:true}],audit:[{id:1,entity_type:"truck",entity_id:"truck-1",truck_id:"truck-1",event_type:"status_changed",reason:"Assigned to verified enterprise trip",actor_id:"admin-1",source:"admin",created_at:${JSON.stringify(now)}}],drivers:[{id:"driver-1",full_name:"Abiyu Nagash Enterprise Driver",phone:"+251911000000"}] };
function App(){return React.createElement("div",null,React.createElement(AdminFleetMaintenance,{fixture}),React.createElement("div",{className:"mx-auto max-w-6xl overflow-x-hidden bg-[#f5f3ed] p-3"},React.createElement(PartnerFleetPanel,{partnerId:"partner-1",canManage:true,fixture:{...fixture,branches:fixture.branches.map((branch)=>({...branch,partner_id:"partner-1"}))}})));}
createRoot(document.getElementById("root")).render(React.createElement(App));
await new Promise((resolve)=>setTimeout(resolve,300));
document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth);
document.documentElement.dataset.ready="true";
`;
await writeFile(entry, fixtureSource, "utf8");
const built = spawnSync(esbuild, [entry, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundle}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
if (built.status !== 0) throw new Error(built.stderr || "Fleet fixture bundle failed.");
await writeFile(html, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${css}"></head><body><div id="root"></div><script type="module" src="./fleet-enterprise-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(vite, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer();
  const chrome = chromeBinary();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-fleet-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"', 'data-overflow="false"', "Fleet control center", "AVAILABILITY BOARD", "Expiry alerts", "Active trip:", "Active trip locks status and driver changes until the trip closes.", "Partner vehicle", "Fleet activity"]) {
        if (!dom.includes(expected)) throw new Error(`Fleet ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
  console.log("Fleet Enterprise browser smoke passed at 320px, 360px, 390px and 412px with no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(temp, { recursive: true, force: true }), rm(bundle, { force: true }), rm(html, { force: true })]);
}
