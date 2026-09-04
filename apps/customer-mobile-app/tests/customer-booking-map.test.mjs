import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const map = fs.readFileSync(new URL("../src/CustomerBookingMap.tsx", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Customer Home matches portal-style real map place selection", () => {
  assert.match(map, /new maplibregl\.Map/);
  assert.match(map, /maps\/basic-v2\/style\.json/);
  assert.match(map, /searchCustomerPlaces\(value, controller\.signal\)/);
  assert.match(map, /reverseCustomerPlace\(coordinates\)/);
  assert.match(map, /map\.on\("click"/);
  assert.match(map, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(map, /draggable: true/);
  assert.match(map, /booking-map-marker-\$\{kind\}/);
  assert.match(map, /portal-map-actions/);
  assert.match(map, />Swap</);
  assert.match(map, />Reset</);
  assert.match(app, /<CustomerBookingMap/);
});

test("Customer place search is English and stays inside the HALLO corridor", () => {
  assert.match(service, /language", "en"/);
  assert.match(service, /country", "et,dj,so"/);
  assert.match(service, /isHalloOperatingCoordinate/);
  assert.match(service, /autocomplete", autocomplete \? "true" : "false"/);
  assert.match(service, /Ethiopia–Djibouti–Somalia operating corridor/);
});

test("selected places automatically calculate and render authenticated HGV distance", () => {
  assert.match(app, /loadCustomerRoutePreview\(identity\.userId/);
  assert.match(app, /pickup: pickupPlace/);
  assert.match(app, /dropoff: dropoffPlace/);
  assert.match(app, /vehicleType: truck\.label/);
  assert.match(map, /AUTO DISTANCE/);
  assert.match(service, /provider !== "openrouteservice"/);
  assert.match(service, /profile !== "driving-hgv"/);
  assert.match(service, /isRouteCoordinates\(coordinates\)/);
  assert.match(map, /customer-booking-hgv-route/);
  assert.match(map, /routePreview\?\.route_coordinates/);
  assert.match(map, /type: "LineString"/);
});

test("portal-parity booking slice remains read-only", () => {
  const combined = `${map}\n${service}\n${app}`;
  assert.doesNotMatch(combined, /\.insert\s*\(/);
  assert.doesNotMatch(combined, /\.update\s*\(/);
  assert.doesNotMatch(combined, /\.delete\s*\(/);
  assert.doesNotMatch(combined, /createCustomerCargoOrder/);
  assert.match(app, /Order creation is not enabled yet/);
  assert.match(app, /HALLO/);
  assert.match(app, /TRUCK/);
});
