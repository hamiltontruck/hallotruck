import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = fs.readFileSync(new URL("../src/customer-vehicle-catalog.ts", import.meta.url), "utf8");
const language = fs.readFileSync(new URL("../src/customer-language.tsx", import.meta.url), "utf8");
const responsive = fs.readFileSync(new URL("../src/customer-booking-responsive.css", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Customer Mobile uses the full shared vehicle catalog and repo-hosted public images", () => {
  for (const label of ["Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo", "Refrigerated", "Truck 22 Ton", "Truck 25 Ton", "Truck 30 Ton", "Trailer"]) {
    assert.match(catalog, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(catalog, /vehicleCapacityTons\[label\.toLowerCase\(\)\]/);
  assert.match(catalog, /getVehiclePresentation\(label\)/);
  assert.match(catalog, /\.\.\/vehicles\/\$\{filename\}/);
  assert.doesNotMatch(catalog, /https?:\/\//);
});

test("language control is the compact EN | OR | አማ segmented control", () => {
  assert.match(language, /value: "en", label: "EN"/);
  assert.match(language, /value: "om", label: "OR"/);
  assert.match(language, /value: "am", label: "አማ"/);
  assert.match(language, /customer-language-separator/);
  assert.match(language, />\|<\/span>/);
  assert.match(language, /aria-pressed=\{language === option\.value\}/);
  assert.match(language, /hallo-customer-language/);
});

test("booking CSS explicitly protects 320/360/390/412-class widths", () => {
  assert.match(responsive, /min-width: 0/);
  assert.match(responsive, /max-width: 100%/);
  assert.match(responsive, /font-size: 16px/);
  assert.match(responsive, /env\(safe-area-inset-left\)/);
  assert.match(responsive, /env\(safe-area-inset-right\)/);
  assert.match(responsive, /env\(safe-area-inset-bottom\)/);
  assert.match(responsive, /@media \(max-width: 339px\)/);
  assert.match(responsive, /@media \(min-width: 340px\) and \(max-width: 359px\)/);
  assert.match(responsive, /@media \(max-width: 379px\)/);
  assert.match(responsive, /@media \(min-width: 390px\)/);
  assert.match(responsive, /\.customer-truck-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(main, /customer-booking-responsive\.css/);
  assert.doesNotMatch(main, /customer-truck-images/);
});
