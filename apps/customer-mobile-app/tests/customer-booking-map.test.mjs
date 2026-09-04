import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const map = fs.readFileSync(new URL("../src/CustomerBookingMap.tsx", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Customer Home uses a real map with place search and location selection", () => {
  assert.match(map, /new maplibregl\.Map/);
  assert.match(map, /searchCustomerPlaces\(value, controller\.signal\)/);
  assert.match(map, /reverseCustomerPlace\(coordinates\)/);
  assert.match(map, /map\.on\("click"/);
  assert.match(map, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(map, /booking-map-marker-\$\{kind\}/);
  assert.match(map, /updateMarker\(pickupMarkerRef\.current, map, pickupCoordinates, "pickup"\)/);
  assert.match(map, /updateMarker\(dropoffMarkerRef\.current, map, dropoffCoordinates, "dropoff"\)/);
  assert.match(app, /<CustomerBookingMap/);
});

test("Customer place search stays inside the HALLO operating corridor", () => {
  assert.match(service, /country", "et,dj,so"/);
  assert.match(service, /isHalloOperatingCoordinate/);
  assert.match(service, /autocomplete", autocomplete \? "true" : "false"/);
  assert.match(service, /Ethiopia–Djibouti–Somalia corridor/);
});

test("real HGV route geometry is validated and rendered after quote", () => {
  assert.match(service, /route_coordinates: \[number, number\]\[\]/);
  assert.match(service, /isRouteCoordinates\(routeCoordinates\)/);
  assert.match(service, /provider !== "openrouteservice"/);
  assert.match(service, /profile !== "driving-hgv"/);
  assert.match(map, /customer-booking-hgv-route/);
  assert.match(map, /routePreview\?\.route_coordinates/);
  assert.match(map, /type: "LineString"/);
});

test("booking map slice remains read-only", () => {
  const combined = `${map}\n${service}\n${app}`;
  assert.doesNotMatch(combined, /\.insert\s*\(/);
  assert.doesNotMatch(combined, /\.update\s*\(/);
  assert.doesNotMatch(combined, /\.delete\s*\(/);
  assert.doesNotMatch(combined, /createCustomerCargoOrder/);
  assert.match(app, /Order creation amma hin banamne/);
});
