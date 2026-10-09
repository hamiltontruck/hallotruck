import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const quoteService = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const geocoderSelection = fs.readFileSync(new URL("../src/customer-geocoder-selection.ts", import.meta.url), "utf8");

test("Customer Djibouti locality selection keeps city identity and provider coordinates", () => {
  assert.match(geocoderSelection, /region\.1713/);
  assert.match(geocoderSelection, /feature\.center/);
  assert.match(quoteService, /normalizePlaceSearchText\(query\) === "djibouti"/);
  assert.match(quoteService, /LOCALITY_GEOCODE_TYPES/);
});

test("Customer HGV request preserves pickup then destination coordinate order", () => {
  const pickup = quoteService.indexOf("pickup: input.pickup.coordinates");
  const destination = quoteService.indexOf("dropoff: input.dropoff.coordinates");
  assert.ok(pickup >= 0, "pickup coordinates must be sent");
  assert.ok(destination > pickup, "drop-off coordinates must follow pickup coordinates");
});

test("Customer ORS failure is surfaced and has no fake route, metric, or quote fallback", () => {
  assert.match(quoteService, /if \(!response\.ok\) throw new Error/);
  assert.match(quoteService, /provider !== "openrouteservice"/);
  assert.match(quoteService, /profile !== "driving-hgv"/);
  assert.match(quoteService, /finitePositive\(payload\?\.distanceKm/);
  assert.match(quoteService, /finitePositive\(payload\?\.durationMinutes/);
  assert.doesNotMatch(quoteService, /haversine|straight.?line|fake route|fallback route/i);
  assert.doesNotMatch(quoteService, /catch\s*\([^)]*\)\s*\{[^}]*return\s+\{[^}]*distance_km/is);
});
