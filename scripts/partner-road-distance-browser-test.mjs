import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

// Render the real legacy order form and save service; replace external boundaries only.
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom'; import {PartnerOrderNew} from './src/pages/PartnerOrderNew'; createRoot(document.getElementById('root')).render(<MemoryRouter><PartnerOrderNew/></MemoryRouter>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", define: { "import.meta.env.VITE_PARTNER_SMART_ORDER_V2": '"false"', "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "external-test-boundaries", setup(builder) {
    builder.onResolve({ filter: /partner\.service|partner-smart-order-routing\.service|\/routing\.service|supabase\.client|PartnerSmartOrderV2/ }, (args) => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ loader: "js", contents:
      args.path.includes("partner.service") ? 'export const getCurrentPartnerMemberships=async()=>[{partner_id:"TEST-partner",member_role:"owner"}];'
      : args.path.includes("partner-smart-order-routing") ? 'export const searchPartnerRoutePlaces=async(q)=>q==="Unknown district"?[]:[{label:q,coordinates:q.includes("Adama")?[39.27,8.54]:[38.76,9.01],location:{country:"Ethiopia",region:q.includes("Adama")?"Oromia":"Addis Ababa",city:q.includes("Unmapped")?"":q.includes("Adama")?"Adama":"Addis Ababa",address:q}}];'
      : args.path.includes("routing.service") ? 'export const getTruckRoadRoute=(input)=>new Promise((resolve,reject)=>{window.routeRequests.push({input,resolve,reject});});'
      : args.path.includes("supabase") ? 'export const supabase={rpc:async(name,args)=>{window.saveCalls=(window.saveCalls||0)+1;if(window.failSave){window.failSave=false;return {data:null,error:new Error("Temporary draft save failure")};}window.saved={name,args};return {data:{id:"TEST-order"},error:null}}};'
      : 'export const PartnerSmartOrderV2=()=>null;' }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), "partner-distance-"));
const fixture = join(directory, "index.html");
const cssFile = (await readdir("dist/assets")).find(name => name.endsWith(".css"));
const css = await readFile(join("dist/assets", cssFile), "utf8");
await writeFile(fixture, `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>window.routeRequests=[];</script><script>${bundle.outputFiles[0].text}</script></body></html>`);
const server = createServer(async (_req,res) => { res.setHeader("Content-Type", "text/html"); res.end(await readFile(fixture)); });
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (process.env.CI ? "/usr/bin/google-chrome" : "/usr/bin/chromium"), args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function mobileLayout(label) {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({width, height:844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} fits ${width}px`);
      const outside = await page.locator('form input,form select,form textarea').evaluateAll(inputs => inputs.filter(input => {
        if (!input.getClientRects().length) return false;
        const rect = input.getBoundingClientRect();
        return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
      }).map(input => input.name));
      assert.deepEqual(outside, [], `${label} fields remain inside ${width}px`);
    }
    await page.setViewportSize({width:390, height:844});
    if (process.env.COMPACT_ORDER_SCREENSHOT_DIR) {
      await mkdir(process.env.COMPACT_ORDER_SCREENSHOT_DIR, {recursive:true});
      await page.screenshot({path:join(process.env.COMPACT_ORDER_SCREENSHOT_DIR,`${label}.png`),fullPage:true});
    }
  }
  const save = page.getByRole("button", { name: "Save draft" });
  const next = page.getByRole("button", { name: "Next", exact: true });
  assert.equal(await page.locator('[name="pickupCountry"],[name="dropoffCountry"],[name="pickupRegion"],[name="dropoffRegion"]').count(), 0, "Do not ask for country/region already supplied by the selected map places");
  await mobileLayout("route");
  assert.equal(await next.count(), 1, "New order should show only its current step and a Next action");
  assert.equal(await save.count(), 0, "Save must appear only after review");
  assert.equal(await page.getByLabel("Cargo category", { exact: true }).isVisible(), false);
  await page.getByLabel("Pickup map location", { exact: true }).press("Enter");
  assert.equal(await page.evaluate(() => window.saved), undefined, "Enter cannot bypass review");
  async function choose(label, value) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByRole("button", { name: value, exact: true }).click(); }
  await page.getByLabel("Pickup map location", {exact:true}).fill("Unknown district");
  await page.getByRole("status").getByText(/No matching place/).waitFor();
  assert.equal(await next.isDisabled(), true);
  await choose("Pickup map location", "Addis");
  assert.equal(await page.getByLabel("Pickup map location", {exact:true}).evaluate(input=>input===document.activeElement), true, "Selecting pickup must not move focus to destination");
  assert.equal(await page.getByLabel("Destination map location", {exact:true}).inputValue(), "");
  await choose("Destination map location", "Adama");
  await page.waitForFunction(() => window.routeRequests.length === 1);
  assert.equal(await page.getByLabel("Pickup map location", { exact: true }).inputValue(), "Addis");
  assert.equal(await next.isDisabled(), true);
  const result = { provider: "openrouteservice", profile: "driving-hgv", distanceKm: 99.5, durationMinutes: 91.2 };
  await page.evaluate((route) => window.routeRequests[0].resolve(route), result);
  await page.getByText("99.5 km", { exact: true }).waitFor();
  assert.equal(await next.isDisabled(), false);
  await page.getByLabel("Destination map location", { exact: true }).fill("Adama new");
  assert.equal(await next.isDisabled(), true);
  assert.equal(await page.getByText("99.5 km", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Adama new", exact: true }).click();
  await page.waitForFunction(() => window.routeRequests.length === 2);
  await choose("Destination map location", "Adama final");
  await page.waitForFunction(() => window.routeRequests.length === 3);
  await page.evaluate((route) => window.routeRequests[1].resolve(route), result);
  assert.equal(await next.isDisabled(), true);
  await page.evaluate(() => window.routeRequests[2].reject(new Error("Routing unavailable")));
  await page.getByRole("alert").getByText("Routing unavailable").waitFor();
  assert.equal(await next.isDisabled(), true);
  await page.getByRole("button", { name: "Retry route" }).click();
  await page.waitForFunction(() => window.routeRequests.length === 4);
  await page.evaluate((route) => window.routeRequests[3].resolve(route), result);
  await page.getByText("99.5 km", { exact: true }).waitFor();
  await mobileLayout("route-selected");
  assert.equal(await page.locator('[name="pickupCity"],[name="dropoffCity"]').count(), 0, "Known cities must not be retyped");
  await page.getByText("Add pickup / delivery instructions", {exact:true}).click();
  await page.locator('[name="pickupAddress"]').fill("TEST pickup gate");
  assert.equal(await page.locator('[name="dropoffAddress"]').inputValue(), "", "Pickup instructions cannot populate destination");
  await page.locator('[name="dropoffAddress"]').fill("TEST delivery gate");
  await next.click();
  await page.getByLabel("Cargo description", {exact:true}).waitFor();
  assert.equal(await page.locator('[data-step="1"] input[required]').count(), 3, "Only cargo description, weight and truck type are mandatory");
  await page.locator('[name="cargoDescription"]').fill("TEST rice");
  await page.locator('[name="truckType"]').fill("Truck 22 Ton");
  await page.getByLabel("Cargo description", { exact: true }).waitFor();
  await mobileLayout("cargo");
  await page.locator('[name="weight"]').fill("5.5");
  await page.getByText("Additional cargo & truck options", {exact:true}).click();
  await page.locator('[name="fragile"]').check();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.textContent === "Route");
  assert.equal(await page.getByLabel("Pickup map location", {exact:true}).inputValue(), "Addis");
  assert.equal(await page.locator('[name="pickupAddress"]').inputValue(), "TEST pickup gate");
  assert.equal(await page.getByLabel("Destination map location", { exact: true }).inputValue(), "Adama final");
  await next.click();
  assert.equal(await page.locator('[name="weight"]').inputValue(), "5.5");
  await next.click();
  await page.getByLabel("Requested pickup date", { exact: true }).waitFor();
  await page.locator('[name="pickupDate"]').fill("2026-11-01");
  await page.locator('[name="pickupName"]').fill("TEST Pickup");
  await page.locator('[name="pickupPhone"]').fill("+251911000000");
  assert.equal(await page.locator('[name="deliveryName"]').inputValue(), "", "Never silently copy pickup contact");
  assert.equal(await page.locator('[name="deliveryPhone"]').inputValue(), "");
  await page.locator('[name="deliveryName"]').fill("TEST Delivery");
  await page.locator('[name="deliveryPhone"]').fill("+251922000000");
  await mobileLayout("schedule-default");
  // Optional fields remain editable and must be validated even when collapsed.
  const email = page.locator('[name="pickupEmail"]');
  await page.getByText("More schedule & contact options", { exact: true }).click();
  await email.fill("invalid");
  await page.getByText("More schedule & contact options", { exact: true }).click();
  await next.click();
  assert.equal(await email.isVisible(), true, "Invalid collapsed fields must be revealed");
  await email.fill("pickup@example.test");
  await mobileLayout("schedule");
  await page.getByLabel("Use pickup contact for delivery", {exact:true}).check();
  await next.click();
  assert.match(await page.locator('[aria-label="Order summary"]').innerText(), /Delivery: TEST Pickup/);
  await page.getByRole("button", {name:"Back",exact:true}).click();
  await page.getByLabel("Use pickup contact for delivery", {exact:true}).uncheck();
  assert.equal(await page.locator('[name="deliveryName"]').inputValue(), "TEST Delivery", "Turning reuse off restores independent delivery data");
  assert.equal(await page.locator('[name="deliveryPhone"]').inputValue(), "+251922000000");
  await next.click();
  await page.getByRole("heading", { name: "Review order", exact: true }).waitFor();
  assert.match(await page.locator('[aria-label="Order summary"]').innerText(), /Addis Ababa/);
  assert.match(await page.locator('[aria-label="Order summary"]').innerText(), /5.5 tons/);
  assert.match(await page.locator('[aria-label="Order summary"]').innerText(), /Fragile/);
  await mobileLayout("review");
  await page.getByLabel("Payment method", {exact:true}).selectOption("bank");
  await page.getByText("Add Partner notes", {exact:true}).click();
  await page.getByLabel("Partner notes", {exact:true}).fill("TEST notes kept across Back/Next");
  assert.equal(await page.evaluate(() => window.saved), undefined, "Next must never save");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  assert.equal(await email.inputValue(), "pickup@example.test");
  await next.click();
  assert.equal(await page.getByLabel("Payment method", {exact:true}).inputValue(), "bank");
  assert.equal(await page.getByLabel("Partner notes", {exact:true}).inputValue(), "TEST notes kept across Back/Next");
  await page.evaluate(() => {window.failSave = true;});
  await save.click();
  await page.getByRole("alert").getByText("Temporary draft save failure").waitFor();
  assert.equal(await save.isEnabled(), true);
  assert.match(await page.locator('[aria-label="Order summary"]').innerText(), /5.5 tons/);
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
  assert.equal(saved.args.p_payload.payment.method, "bank");
  assert.equal(saved.args.p_payload.partner_notes, "TEST notes kept across Back/Next");
  assert.equal(await page.evaluate(() => window.saveCalls), 2, "Only explicit Save clicks may call the RPC; first failure then successful retry");
  assert.deepEqual(errors, []);
  assert.equal(saved.args.p_payload.cargo.weight_tons, 5.5);
  assert.equal(saved.args.p_payload.cargo.fragile, true);
  assert.equal(saved.args.p_payload.pickup_contact.email, "pickup@example.test");
  assert.equal(saved.args.p_payload.pickup_contact.name, "TEST Pickup");
  assert.equal(saved.args.p_payload.delivery_contact.name, "TEST Delivery");
  assert.equal(saved.args.p_payload.delivery_contact.phone, "0922000000");
  assert.deepEqual(saved.args.p_payload.pickup_location, {country:"Ethiopia",region:"Addis Ababa",city:"Addis Ababa",address:"Addis · TEST pickup gate",longitude:38.76,latitude:9.01});
  assert.deepEqual(saved.args.p_payload.dropoff_location, {country:"Ethiopia",region:"Oromia",city:"Adama",address:"Adama final · TEST delivery gate",longitude:39.27,latitude:8.54});
  assert.equal(saved.args.p_payload.vehicle_requirements.required_capacity_tons, 5.5);
  assert.equal(saved.args.p_payload.cargo.quantity, 1);
  const partial = await browser.newPage({viewport:{width:390,height:844}});
  await partial.goto(`http://127.0.0.1:${server.address().port}`);
  for (const [label,query] of [["Pickup map location","Unmapped landmark"],["Destination map location","Adama"]]) {
    await partial.getByLabel(label,{exact:true}).fill(query);
    await partial.getByRole("button",{name:query,exact:true}).click();
  }
  await partial.waitForFunction(()=>window.routeRequests.length===1);
  await partial.evaluate(route=>window.routeRequests[0].resolve(route),result);
  const partialNext=partial.getByRole("button",{name:"Next",exact:true});
  await partial.getByLabel("Pickup town / city",{exact:true}).waitFor();
  await partialNext.click();
  assert.equal(await partial.getByLabel("Cargo description",{exact:true}).isVisible(),false,"Unknown provider city must be explicitly supplied");
  await partial.getByLabel("Pickup town / city",{exact:true}).fill("Addis Ababa");
  // Editing the other endpoint cannot discard a manually supplied missing city.
  await partial.getByLabel("Destination map location",{exact:true}).fill("Adama new");
  await partial.getByRole("button",{name:"Adama new",exact:true}).click();
  await partial.waitForFunction(()=>window.routeRequests.length===2);
  await partial.evaluate(route=>window.routeRequests[1].resolve(route),result);
  assert.equal(await partial.getByLabel("Pickup town / city",{exact:true}).inputValue(),"Addis Ababa");
  await partialNext.click();
  await partial.getByLabel("Cargo description",{exact:true}).waitFor();
  await partial.close();
  console.log("Partner order input reduction: 4 steps, required/optional validation, Back/Next persistence, 320–768px controls, review, no early save, route/save retries and real RPC payload PASS");
} finally { await browser.close(); server.close(); await rm(directory, { recursive: true, force: true }); }
