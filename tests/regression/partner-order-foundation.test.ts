import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (file: string) => readFile(path.join(process.cwd(), file), "utf8");
const migration = await read("supabase/migrations/20260902013000_partner_order_foundation.sql");
const app = await read("src/App.tsx");
const service = await read("src/services/partner-order.service.ts");
const list = await read("src/pages/PartnerOrders.tsx");
const form = await read("src/pages/PartnerOrderNew.tsx");
const browser = await read("scripts/partner-order-e2e-smoke.mjs");
const packageJson = await read("package.json");

test("Partner order lifecycle and immutable history are separate from canonical orders", () => {
  assert.match(migration, /create table public\.partner_orders/);
  assert.match(migration, /canonical_order_id uuid unique references public\.orders\(id\) on delete restrict/);
  for (const status of ["draft","submitted","under_review","quoted","approved","placed","assigned","accepted","in_transit","delivered","completed","cancelled","rejected","expired"]) assert.match(migration, new RegExp(`'${status}'`));
  assert.match(migration, /create table public\.partner_order_status_history/);
  assert.match(migration, /partner_order_id uuid not null references public\.partner_orders\(id\) on delete restrict/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(orders|payments|partner_order_status_history)/i);
});

test("Partner order reads are tenant isolated and mutations are RPC-only", () => {
  assert.match(migration, /alter table public\.partner_orders enable row level security/);
  assert.match(migration, /private\.is_admin_or_ceo\(\)[\s\S]*private\.is_partner_member\(partner_id\)/);
  assert.match(migration, /revoke all on table public\.partner_orders, public\.partner_order_status_history from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.partner_orders, public\.partner_order_status_history to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*partner_orders/i);
});

test("Partner owner and admin writes require active database membership and Partner profile", () => {
  for (const fn of ["partner_save_order_draft","partner_submit_order"]) assert.match(migration, new RegExp(`function public\\.${fn}`));
  assert.match(migration, /membership\.user_id=v_actor[\s\S]*membership\.active[\s\S]*membership\.member_role in \('owner','admin'\)[\s\S]*organization\.status='active'[\s\S]*profile\.role::text='partner'/);
  assert.doesNotMatch(migration, /(user_metadata|app_metadata|auth\.jwt\(\))/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function public\.partner_save_order_draft\(uuid,uuid,jsonb,uuid\) from public,anon/);
  assert.match(migration, /request_key=p_request_key and partner_id=p_partner_id/);
});

test("Partner order pages are protected, discoverable and mobile-safe", () => {
  assert.match(app, /path="\/partner\/orders" element=\{<PartnerGate><PartnerOrders \/><\/PartnerGate>\}/);
  assert.match(app, /path="\/partner\/orders\/new" element=\{<PartnerGate><PartnerOrderNew \/><\/PartnerGate>\}/);
  assert.match(app, /path="\/partner\/orders\/:orderId" element=\{<PartnerGate><PartnerOrderDetails \/><\/PartnerGate>\}/);
  assert.match(list, /overflow-x-auto/);
  assert.match(list, /md:grid-cols-2/);
  assert.match(form, /min-w-0/);
  assert.match(form, /sm:grid-cols-2/);
});

test("Partner order contact validation accepts Ethiopian and explicit international numbers", () => {
  assert.match(service, /\^\(\?:\\\+251\|251\|0\)\?9\\d\{8\}\$/);
  assert.match(service, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  assert.match(service, /Enter a valid contact email address/);
  assert.match(migration, /v_phone !~ '\^\(\\\+251\|251\|0\)\?9\[0-9\]\{8\}\$'/);
  assert.match(migration, /v_phone !~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/);
  assert.match(migration, /length\(v_email\)>254/);
});

test("New Partner order captures the first-slice operational requirements", () => {
  for (const marker of ["pickupCountry","dropoffCountry","cargoCategory","cargoDescription","weight","quantity","truckType","capacity","pickupDate","deadline","pickupPhone","deliveryPhone","paymentMethod"]) assert.match(form, new RegExp(marker));
  for (const marker of ["fragile","hazardous","temperature","refrigeration"]) assert.match(form, new RegExp(marker));
});

test("Partner order browser smoke covers every production target width", () => {
  for (const width of [320,360,390,412,430,768,1280]) assert.match(browser, new RegExp(String(width)));
  assert.match(browser, /data-overflow/);
  assert.match(packageJson, /node scripts\/partner-order-e2e-smoke\.mjs/);
});
