import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Customer quote preview reuses authenticated truck routing and pricing RPC", () => {
  assert.match(service, /auth\.getSession\(\)/);
  assert.match(service, /session\.user\.id !== userId/);
  assert.match(service, /\/quote-route/);
  assert.match(service, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(service, /client\.rpc\("calculate_transport_quote_v2"/);
  assert.match(service, /p_distance_km: distanceKm/);
  assert.match(service, /p_cargo_tons: cargoTons/);
});

test("Customer quote preview stays read-only", () => {
  assert.doesNotMatch(service, /\.insert\s*\(/);
  assert.doesNotMatch(service, /\.update\s*\(/);
  assert.doesNotMatch(service, /\.delete\s*\(/);
  assert.doesNotMatch(service, /createCustomerCargoOrder/);
  assert.doesNotMatch(service, /service[_-]?role/i);
  assert.match(app, /Order creation amma hin banamne/);
  assert.doesNotMatch(app, /createCustomerCargoOrder/);
});

test("Booking quote requires route, load and truck capacity before calculation", () => {
  assert.match(app, /cargoUnit === "quintal" \? rawCargoAmount \/ 10 : rawCargoAmount/);
  assert.match(app, /cargoTons <= truck\.maxTons/);
  assert.match(app, /loadCustomerQuotePreview\(userId/);
  assert.match(app, /disabled=\{quoteLoading \|\| !routeReady \|\| !cargoReady\}/);
  assert.match(app, /Current Admin-managed transport rate/);
});
