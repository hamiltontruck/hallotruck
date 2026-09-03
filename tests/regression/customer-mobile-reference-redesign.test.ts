import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const css = await readFile(path.join(process.cwd(), "src/styles/customer-mobile-reference-redesign.css"), "utf8");
const main = await readFile(path.join(process.cwd(), "src/main.tsx"), "utf8");

test("Customer reference redesign is mobile-only and loaded after prior customer overrides", () => {
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(main, /customer-mobile-header\.css[\s\S]*customer-mobile-reference-redesign\.css/);
});

test("Customer Home uses a full-map mobile booking surface", () => {
  assert.match(css, /customer-map-home__welcome[\s\S]*display:\s*none/);
  assert.match(css, /customer-map-home__map-shell[\s\S]*min-height:\s*calc\(100dvh/);
  assert.match(css, /customer-map-home__map > div > \.grid:first-child[\s\S]*position:\s*absolute/);
  assert.match(css, /customer-map-home__map \.maplibregl-map[\s\S]*height:\s*calc\(100dvh/);
});

test("Customer booking sheet matches compact two-column reference without overlaying controls", () => {
  assert.match(css, /customer-map-home__sheet\.is-expanded[\s\S]*position:\s*fixed/);
  assert.match(css, /customer-map-home__sheet-body[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /customer-map-home__vehicles[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /customer-map-home__confirm-dock[\s\S]*position:\s*static/);
  assert.match(css, /customer-map-home__confirm[\s\S]*background:\s*var\(--customer-mobile-blue\)/);
});

test("Customer live tracking is map-first with floating status and compact trip cards", () => {
  assert.match(css, /customer-live-page__header[\s\S]*position:\s*fixed/);
  assert.match(css, /customer-live-page__map-shell[\s\S]*order:\s*-10/);
  assert.match(css, /customer-live-map__canvas[\s\S]*order:\s*-20/);
  assert.match(css, /customer-live-page__driver[\s\S]*order:\s*20/);
  assert.match(css, /customer-live-page__route[\s\S]*order:\s*21/);
});
