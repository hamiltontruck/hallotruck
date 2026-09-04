import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Customer route and quote preview reuse authenticated HGV routing and pricing RPC", () => {
  assert.match(service, /auth\.getSession\(\)/);
  assert.match(service, /session\.user\.id !== userId/);
  assert.match(service, /\/quote-route/);
  assert.match(service, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(service, /export async function loadCustomerRoutePreview/);
  assert.match(service, /client\.rpc\("calculate_transport_quote_v2"/);
  assert.match(service, /p_distance_km: route\.distance_km/);
  assert.match(service, /p_cargo_tons: cargoTons/);
});

test("Customer quote preview stays read-only", () => {
  assert.doesNotMatch(service, /\.insert\s*\(/);
  assert.doesNotMatch(service, /\.update\s*\(/);
  assert.doesNotMatch(service, /\.delete\s*\(/);
  assert.doesNotMatch(service, /createCustomerCargoOrder/);
  assert.doesNotMatch(service, /service[_-]?role/i);
  assert.match(app, /Order creation is not enabled yet/);
  assert.doesNotMatch(app, /createCustomerCargoOrder/);
});

test("Booking quote requires automatic route, load and truck capacity", () => {
  assert.match(app, /cargoUnit === "quintal" \? rawCargoAmount \/ 10 : rawCargoAmount/);
  assert.match(app, /cargoTons <= truck\.maxTons/);
  assert.match(app, /loadCustomerQuotePreview\(userId/);
  assert.match(app, /pickupPlace,/);
  assert.match(app, /dropoffPlace,/);
  assert.match(app, /disabled=\{quoteLoading \|\| !routeReady \|\| !cargoReady\}/);
  assert.match(app, /Automatic HGV distance \+ existing secure pricing RPC/);
  assert.match(app, /Current Admin-managed transport rate/);
});
