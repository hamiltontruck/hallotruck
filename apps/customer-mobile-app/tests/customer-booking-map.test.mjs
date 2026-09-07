import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const map = fs.readFileSync(new URL("../src/CustomerBookingMap.tsx", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const responsive = fs.readFileSync(new URL("../src/customer-booking-responsive.css", import.meta.url), "utf8");

test("Customer Home keeps real map place selection and HGV route", () => {
  assert.match(map, /new maplibregl\.Map/);
  assert.match(map, /searchCustomerPlaces\(value, controller\.signal\)/);
  assert.match(map, /reverseCustomerPlace\(coordinates\)/);
  assert.match(map, /map\.on\("click"/);
  assert.match(map, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(map, /draggable: true/);
  assert.match(map, /portal-map-actions/);
  assert.match(map, />Swap</);
  assert.match(map, />Reset</);
  assert.match(app, /<CustomerBookingMap/);
  assert.match(app, /<CustomerBookingFlow/);
});

test("Customer place search stays inside the HALLO corridor", () => {
  assert.match(service, /language", "en"/);
  assert.match(service, /country", "et,dj,so"/);
  assert.match(service, /isHalloOperatingCoordinate/);
  assert.match(service, /Ethiopia–Djibouti–Somalia operating corridor/);
});

test("route controls and inputs are mobile-safe without horizontal overflow", () => {
  assert.match(responsive, /\.real-route-card input[\s\S]*font-size: 16px/);
  assert.match(responsive, /\.portal-map-actions \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /\.portal-map-actions button,[\s\S]*min-width: 0/);
  assert.match(responsive, /\.real-start-sheet \{[\s\S]*right: max\(0\.6rem, env\(safe-area-inset-right\)\)/);
  assert.match(responsive, /overflow-x: hidden/);
});

test("successful placed order navigates to Orders rather than empty active-trip tracking", () => {
  assert.match(app, /function handleOrderCreated\(order: CreatedCustomerOrder\)/);
  assert.match(app, /setCreatedOrder\(order\)/);
  assert.match(app, /setTab\("orders"\)/);
  assert.match(app, /Order confirmed/);
  assert.doesNotMatch(app, /Order creation is not enabled yet/);
});
