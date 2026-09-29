import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const map = fs.readFileSync(new URL("../src/CustomerBookingMap.tsx", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/customer-final-ui.css", import.meta.url), "utf8");

test("place search keeps city/locality results routable and ranks them ahead of POIs", () => {
  assert.match(service, /function placeMatchesSearchQuery\(/);
  assert.match(service, /placeMatchesSearchQuery\(clean, place\.label\)/);
  assert.match(service, /ROUTABLE_LOCALITY_PLACE_TYPES/);
  assert.match(service, /rankGeocodeFeature\(clean, feature\)/);
  assert.match(service, /sort\(\(left, right\) => rankGeocodeFeature\(clean, right\) - rankGeocodeFeature\(clean, left\)\)/);
  assert.doesNotMatch(service, /NON_ROUTABLE_PLACE_TYPES = new Set\(\[[^\]]*"region"/);
});

test("booking map resizes and refits the real route when its viewport changes", () => {
  assert.match(map, /function fitBookingMapToPoints\(/);
  assert.match(map, /map\.resize\(\)/);
  assert.match(map, /new ResizeObserver\(/);
  assert.match(map, /visualViewport\?\.addEventListener\("resize"/);
  assert.match(map, /fitBookingMapToPoints\(map, points/);
});

test("truck picker preserves 3:2 images, stable selection layout and short-screen scrolling", () => {
  assert.match(css, /\.customer-final-truck-list\{[^}]*grid-auto-rows:max-content[^}]*align-content:start/);
  assert.match(css, /\.customer-final-truck-image\{[^}]*aspect-ratio:3\/2/);
  assert.match(css, /\.customer-final-truck-image img\{[^}]*object-fit:contain/);
  assert.match(css, /\.customer-final-truck-row\.selected\{[^}]*border-color:var\(--customer-final-blue\)[^}]*box-shadow:/);
  assert.doesNotMatch(css, /\.customer-final-truck-row\.selected\{[^}]*padding:/);
  assert.match(css, /\.customer-final-step-body--truck \.customer-final-truck-list\{[^}]*overflow-y:auto/);
  assert.match(css, /\.customer-final-truck-action\{[^}]*padding-bottom:max\([^}]*env\(safe-area-inset-bottom\)/);
});
