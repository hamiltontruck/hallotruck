import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { featureToPlaceForSelection, selectGeocodeCandidates } from "../src/customer-geocoder-selection.ts";

const quoteService = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");

test("Customer Djibouti locality selection keeps city identity and provider coordinates", () => {
  const city = { id: "region.1713", text: "Djibouti", place_name: "Djibouti, Djibouti", place_type: ["region"], center: [43.14727216959, 11.59369036353], context: [{ id: "country.dj", text: "Djibouti" }] };
  const aliSabieh = { id: "region.ali", text: "Djibouti", place_name: "Djibouti, Ali Sabieh, Djibouti", place_type: ["region"], center: [42.71, 11.15] };
  const selected = selectGeocodeCandidates("Djibouti", [aliSabieh, city], []);
  assert.equal(selected[0]?.id, "region.1713");
  assert.deepEqual(featureToPlaceForSelection(selected[0]).coordinates, city.center);
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
