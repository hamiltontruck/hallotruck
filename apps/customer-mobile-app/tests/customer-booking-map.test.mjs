import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const map = fs.readFileSync(new URL("../src/CustomerBookingMap.tsx", import.meta.url), "utf8");
const mapCss = fs.readFileSync(new URL("../src/booking-map.css", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const journey = fs.readFileSync(new URL("../src/CustomerBookingJourney.tsx", import.meta.url), "utf8");
const responsive = fs.readFileSync(new URL("../src/customer-booking-responsive.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Customer Home keeps real map place selection and HGV route", () => {
  assert.match(map, /new maplibregl\.Map/);
  assert.match(map, /new maplibregl\.NavigationControl/);
  assert.match(map, /searchCustomerPlaces\(value, controller\.signal\)/);
  assert.match(map, /reverseCustomerPlace\(coordinates\)/);
  assert.match(map, /map\.on\("click"/);
  assert.match(map, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(map, /draggable: true/);
  assert.match(map, /portal-map-actions/);
  assert.match(map, />Swap</);
  assert.match(map, />Reset</);
  assert.match(app, /<CustomerBookingJourney/);
  assert.match(journey, /<CustomerBookingMap/);
  assert.match(journey, /loadCustomerQuotePreview/);
  assert.match(journey, /createCustomerMobileOrder/);
});

test("My location matches portal pickup behavior and survives temporary GPS failures", () => {
  assert.match(map, /readCurrentPosition\(\{ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 \}\)/);
  assert.match(map, /if \(locationError\.code === 1\) throw locationError/);
  assert.match(map, /readCurrentPosition\(\{ enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 \}\)/);
  assert.match(map, /isHalloOperatingCoordinate\(coordinates\)/);
  assert.match(map, /place = \{ label: `\$\{coordinates\[1\]\.toFixed\(5\)\}, \$\{coordinates\[0\]\.toFixed\(5\)\}`, coordinates \}/);
  assert.match(map, /onPickupSelect\(place\)/);
  assert.match(map, /activeFieldRef\.current = "dropoff"/);
  assert.match(map, /mapRef\.current\?\.flyTo\(\{ center: coordinates, zoom: 10, duration: 500 \}\)/);
  assert.match(map, /Location permission was denied/);
  assert.match(map, /current location is unavailable/);
  assert.match(map, /current location timed out/);
});

test("drop-off autocomplete stays above route actions and My location remains on the right", () => {
  assert.match(mapCss, /\.real-booking-map \.real-route-card \{ z-index: 40; \}/);
  assert.match(mapCss, /\.booking-place-results \{ position: absolute; z-index: 60;/);
  assert.match(mapCss, /\.portal-map-actions \{ position: absolute; z-index: 16;/);
  assert.match(mapCss, /\.real-booking-map \.portal-map-actions button:first-child \{ order: 3; \}/);
});

test("Customer place search stays inside the HALLO corridor", () => {
  assert.match(service, /language", "en"/);
  assert.match(service, /country", "et,dj,so"/);
  assert.match(service, /isHalloOperatingCoordinate/);
  assert.match(service, /Ethiopia–Djibouti–Somalia operating corridor/);
});

test("route controls and inputs are mobile-safe without horizontal overflow", () => {
  assert.match(responsive, /\.real-route-card input[\s\S]*font-size: 16px/);
  assert.match(mapCss, /\.booking-place-field input \{[\s\S]*font-size: 16px/);
  assert.match(mapCss, /\.booking-place-field input \{[\s\S]*min-width: 0/);
  assert.match(mapCss, /\.booking-place-field input \{[\s\S]*max-width: 100%/);
  assert.match(mapCss, /touch-action: manipulation/);
  assert.match(responsive, /\.portal-map-actions \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /\.portal-map-actions button,[\s\S]*min-width: 0/);
  assert.match(responsive, /\.real-start-sheet \{[\s\S]*right: max\(0\.6rem, env\(safe-area-inset-right\)\)/);
  assert.match(responsive, /overflow-x: hidden/);
});

test("screen focus auto-zoom fix does not disable map or browser pinch zoom", () => {
  assert.match(html, /width=device-width, initial-scale=1, viewport-fit=cover/);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1/i);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(map, /scrollZoom\.disable/);
  assert.doesNotMatch(map, /touchZoomRotate\.disable/);
});

test("successful placed order stays on the real confirmation screen until the Customer chooses the next action", () => {
  assert.match(journey, /setCreatedOrder\(order\)/);
  assert.match(journey, /setStep\("success"\)/);
  assert.match(journey, /bookingConfirmed/);
  assert.match(journey, /onViewOrder\(createdOrder\.id\)/);
  assert.match(app, /onViewOrder=\{\(orderId\) => \{ setBookingOpen\(false\); openOrder\(orderId\); \}\}/);
  assert.doesNotMatch(app, /Order creation is not enabled yet/);
});
