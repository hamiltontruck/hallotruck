import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Render the real legacy order form and save service; replace external boundaries only.
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom'; import {PartnerOrderNew} from './src/pages/PartnerOrderNew'; createRoot(document.getElementById('root')).render(<MemoryRouter><PartnerOrderNew/></MemoryRouter>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", define: { "import.meta.env.VITE_PARTNER_SMART_ORDER_V2": '"false"', "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "external-test-boundaries", setup(builder) {
    builder.onResolve({ filter: /partner\.service|partner-smart-order-routing\.service|\/routing\.service|supabase\.client|PartnerSmartOrderV2/ }, (args) => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ loader: "js", contents:
      args.path.includes("partner.service") ? 'export const getCurrentPartnerMemberships=async()=>[{partner_id:"TEST-partner",member_role:"owner"}];'
      : args.path.includes("partner-smart-order-routing") ? 'export const searchPartnerRoutePlaces=async(q)=>[{label:q,coordinates:q.includes("Adama")?[39.27,8.54]:[38.76,9.01]}];'
      : args.path.includes("routing.service") ? 'export const getTruckRoadRoute=(input)=>new Promise((resolve,reject)=>{window.routeRequests.push({input,resolve,reject});});'
      : args.path.includes("supabase") ? 'export const supabase={rpc:async(name,args)=>{window.saved={name,args};return {data:{id:"TEST-order"},error:null}}};'
      : 'export const PartnerSmartOrderV2=()=>null;' }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), "partner-distance-"));
const fixture = join(directory, "index.html");
await writeFile(fixture, `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window.routeRequests=[];</script><script>${bundle.outputFiles[0].text}</script></body></html>`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(pathToFileURL(fixture).href);
  const save = page.getByRole("button", { name: "Save draft" });
  assert.equal(await save.isDisabled(), true);
  async function choose(label, value) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByRole("button", { name: value, exact: true }).click(); }
  await choose("Pickup map location", "Addis");
  await choose("Destination map location", "Adama");
  await page.waitForFunction(() => window.routeRequests.length === 1);
  assert.equal(await page.getByLabel("Pickup map location", { exact: true }).inputValue(), "Addis");
  assert.equal(await save.isDisabled(), true);
  const result = { provider: "openrouteservice", profile: "driving-hgv", distanceKm: 99.5, durationMinutes: 91.2 };
  await page.evaluate((route) => window.routeRequests[0].resolve(route), result);
  await page.getByText("99.5 km", { exact: true }).waitFor();
  assert.equal(await save.isDisabled(), false);
  await page.getByLabel("Destination map location", { exact: true }).fill("Adama new");
  assert.equal(await save.isDisabled(), true);
  assert.equal(await page.getByText("99.5 km", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Adama new", exact: true }).click();
  await page.waitForFunction(() => window.routeRequests.length === 2);
  await choose("Destination map location", "Adama final");
  await page.waitForFunction(() => window.routeRequests.length === 3);
  await page.evaluate((route) => window.routeRequests[1].resolve(route), result);
  assert.equal(await save.isDisabled(), true);
  await page.evaluate(() => window.routeRequests[2].reject(new Error("Routing unavailable")));
  await page.getByRole("alert").getByText("Routing unavailable").waitFor();
  assert.equal(await save.isDisabled(), true);
  await page.getByRole("button", { name: "Retry route" }).click();
  await page.waitForFunction(() => window.routeRequests.length === 4);
  await page.evaluate((route) => window.routeRequests[3].resolve(route), result);
  await page.getByText("99.5 km", { exact: true }).waitFor();
  // Supply the real form fields, then inspect the actual RPC payload.
  await page.locator("input[name]").evaluateAll((inputs) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    for (const input of inputs) {
      if (input.type === "checkbox") continue;
      const value = input.type === "number" ? "5" : input.type === "date" ? "2026-11-01" : input.type === "time" ? "09:00" : input.type === "datetime-local" ? "2026-11-02T09:00" : input.type === "email" ? "" : input.name.endsWith("Phone") ? "+251911000000" : "TEST location";
      setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await save.click();
  await page.waitForFunction(() => Boolean(window.saved));
  const saved = await page.evaluate(() => window.saved);
  assert.equal(saved.name, "partner_save_order_draft");
  assert.equal(saved.args.p_partner_id, "TEST-partner");
  assert.deepEqual(saved.args.p_payload.route, { provider: "openrouteservice", profile: "driving-hgv", distance_km: 99.5, duration_minutes: 91.2 });
  assert.equal(saved.args.p_payload.pickup_location.longitude, 38.76);
  assert.equal(saved.args.p_payload.dropoff_location.longitude, 39.27);
  assert.equal(saved.args.p_payload.pricing.quote_amount_etb, undefined);
  assert.equal(saved.args.p_payload.payment.status, "unpaid");
  console.log("Actual Partner order form: selected coordinates, auto road distance, stale response ignored, failure/retry, save gating and real RPC payload PASS");
} finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
