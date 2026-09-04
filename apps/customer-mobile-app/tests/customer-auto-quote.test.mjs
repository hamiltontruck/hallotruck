import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Customer Mobile automatically calculates ETB after route and valid load are ready", () => {
  assert.match(app, /window\.setTimeout\(\(\) => \{/);
  assert.match(app, /\}, 250\);/);
  assert.match(app, /loadCustomerQuotePreview\(userId/);
  assert.match(app, /if \(!pickupPlace \|\| !dropoffPlace \|\| !routeReady \|\| cargoTons <= 0\)/);
  assert.match(app, /if \(cargoTons > truck\.maxTons\)/);
  assert.match(app, /setQuote\(result\)/);
  assert.match(app, /Birr calculates automatically from the secure pricing RPC/);
});

test("automatic quote remains read-only", () => {
  assert.doesNotMatch(app, /\.insert\s*\(/);
  assert.doesNotMatch(app, /\.update\s*\(/);
  assert.doesNotMatch(app, /\.delete\s*\(/);
  assert.doesNotMatch(app, /createCustomerCargoOrder/);
  assert.match(app, /Order creation is not enabled yet/);
});
