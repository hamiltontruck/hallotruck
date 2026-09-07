import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const quoteService = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const orderService = fs.readFileSync(new URL("../src/customer-order.service.ts", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("../src/CustomerBookingFlow.tsx", import.meta.url), "utf8");

test("Customer route and quote reuse authenticated HGV routing and pricing RPC", () => {
  assert.match(quoteService, /auth\.getSession\(\)/);
  assert.match(quoteService, /session\.user\.id !== userId/);
  assert.match(quoteService, /\/quote-route/);
  assert.match(quoteService, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(quoteService, /client\.rpc\("calculate_transport_quote_v2"/);
  assert.match(quoteService, /p_distance_km: route\.distance_km/);
  assert.match(quoteService, /p_cargo_tons: cargoTons/);
});

test("Customer Mobile revalidates the displayed quote before insert", () => {
  assert.match(flow, /const freshQuote = await loadCustomerQuotePreview/);
  assert.match(flow, /Math\.abs\(freshQuote\.total_quote_etb - quote\.total_quote_etb\) > 0\.01/);
  assert.match(flow, /Review the refreshed quote and confirm again/);
  assert.match(orderService, /client\.rpc\("calculate_transport_quote_v2"/);
  assert.match(orderService, /Math\.abs\(priceEtb - expectedQuoteEtb\) > 0\.01/);
  assert.match(orderService, /The transport price changed/);
});

test("order creation preserves authenticated Customer ownership and RLS", () => {
  assert.match(orderService, /client\.auth\.getUser\(\)/);
  assert.match(orderService, /auth\.user\.id !== input\.userId/);
  assert.match(orderService, /customer_id: auth\.user\.id/);
  assert.match(orderService, /from\("profiles"\)/);
  assert.match(orderService, /from\("orders"\)/);
  assert.doesNotMatch(orderService, /service[_-]?role/i);
  assert.doesNotMatch(orderService, /SUPABASE_SERVICE/i);
});
