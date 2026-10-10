import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("src/pages/PartnerOrderNew.tsx", "utf8");
const smart = fs.readFileSync("src/pages/PartnerSmartOrderV2.tsx", "utf8");
const service = fs.readFileSync("src/services/partner-smart-order-routing.service.ts", "utf8");
const routing = fs.readFileSync("src/services/routing.service.ts", "utf8");
const responsive = fs.readFileSync("src/styles/partner-smart-order-v2.css", "utf8");
const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

test("Partner Smart Order V2 is opt-in and legacy remains the default", () => {
  assert.match(page, /VITE_PARTNER_SMART_ORDER_V2 === "true"/);
  assert.match(page, /PartnerOrderLegacy/);
  assert.match(page, /PartnerSmartOrderV2/);
});

test("Step 1 uses real shared geocoder autocomplete with endpoint order intact", () => {
  assert.match(service, /api\.maptiler\.com\/geocoding/);
  assert.match(service, /selectGeocodeCandidates/);
  assert.match(service, /country.*et,dj,so/);
  assert.doesNotMatch(service, /hard.?coded|fake|fallback/i);
  assert.match(smart, /pickup/);
  assert.match(smart, /dropoff/);
  assert.ok(smart.indexOf("pickup") < smart.indexOf("dropoff"));
});

test("Step 2 exposes a real MapLibre map with user-draggable endpoint pins", () => {
  assert.match(smart, /maplibre-gl/);
  assert.match(smart, /new maplibregl\.Map/);
  assert.match(smart, /new maplibregl\.Marker/);
  assert.match(smart, /draggable: true/);
  assert.match(smart, /on\("dragend"/);
});

test("Step 3 draws only validated OpenRouteService HGV geometry", () => {
  assert.match(smart, /getTruckRoadRoute/);
  assert.match(smart, /addSource/);
  assert.match(smart, /LineString/);
  assert.match(routing, /provider !== "openrouteservice"/);
  assert.match(routing, /profile !== "driving-hgv"/);
  assert.doesNotMatch(smart, /haversine|straight.?line|fallback route|fake route/i);
});

test("Step 4 exposes metrics only from the validated authoritative route and clears stale state", () => {
  assert.match(smart, /route\.distanceKm/);
  assert.match(smart, /route\.durationMinutes/);
  assert.match(smart, /routeRequest\.current\?\.abort\(\)/);
  assert.match(smart, /setRoute\(null\)/);
  assert.match(smart, /routeVersion\.current/);
  assert.match(smart, /Retry/);
  assert.doesNotMatch(smart, /quote|price|haversine|straight.?line|fallback/i);
});

test("legacy and V2 builds plus required narrow widths are explicit CI contracts", () => {
  assert.match(workflow, /VITE_PARTNER_SMART_ORDER_V2:\s*["']false["']/);
  assert.match(workflow, /VITE_PARTNER_SMART_ORDER_V2:\s*["']true["']/);
  for (const width of [320, 360, 390, 412]) assert.match(responsive, new RegExp(String(width)));
});
