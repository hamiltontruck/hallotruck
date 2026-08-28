import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const page = await readFile(path.join(process.cwd(), "src/pages/CustomerMapHome.tsx"), "utf8");
const service = await readFile(path.join(process.cwd(), "src/services/customer-cargo.service.ts"), "utf8");
const css = await readFile(path.join(process.cwd(), "src/styles/customer-quote-restoration.css"), "utf8");

test("Customer quote sheet starts expanded instead of hiding the order form", () => {
  assert.match(page, /sheetExpanded, setSheetExpanded\] = useState\(true\)/);
  assert.match(page, /customer-map-home__sheet-body/);
});

test("Customer quote retains every truck and tonnage choice", () => {
  for (const truck of [
    "Pickup",
    "Van",
    "Isuzu 5 Ton",
    "Dry Cargo",
    "Refrigerated",
    "Truck 22 Ton",
    "Truck 25 Ton",
    "Truck 30 Ton",
    "Trailer",
  ]) {
    assert.ok(page.includes(`\"${truck}\"`), truck);
  }
  assert.match(page, /cargoQuantity/);
  assert.match(page, /cargoUnit/);
  assert.match(page, /value="ton"/);
  assert.match(page, /value="quintal"/);
  assert.match(page, /vehicleCapacityTons/);
  assert.match(page, /Maximum load|Feʼumsa olaanaa|ከፍተኛ ጭነት/);
});

test("Customer quote retains cargo category, packaging and notes", () => {
  assert.match(page, /CARGO_CATEGORIES/);
  assert.match(page, /PACKAGING_TYPES/);
  assert.match(page, /cargoCopy\.category/);
  assert.match(page, /cargoCopy\.packaging/);
  assert.match(page, /cargoCopy\.notes/);
  assert.match(page, /cargoCategory,/);
  assert.match(page, /packagingType,/);
  assert.match(page, /cargoNotes,/);
});

test("Customer order service stores the selected payment method foundation", () => {
  assert.match(service, /paymentMethod\?: "cash" \| "bank_telebirr"/);
  assert.match(service, /selected_payment_method: input\.paymentMethod \?\? "cash"/);
  assert.match(page, /paymentMethod/);
  assert.match(page, /bank_telebirr/);
});

test("Confirm Order remains locked until route, truck, cargo, load and quote are valid", () => {
  assert.match(page, /const isFormReady = routeReady && truckReady && cargoReady && loadReady && quoteReady/);
  assert.match(page, /disabled=\{busy \|\| !isFormReady\}/);
  assert.match(page, /data-ready=\{isFormReady\}/);
  assert.match(page, /cargoTons <= selectedCapacity/);
  assert.match(page, /\[cargoQuantity, setCargoQuantity\] = useState\(""\)/);
  assert.match(page, /const cleanCargoQuantity = cargoQuantity\.trim\(\)/);
});

test("Customer quote remains scrollable and single-column on narrow phones", () => {
  assert.match(css, /max-height:min\((?:68|72)dvh,(?:42|44)rem\)/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /customer-map-home__load-grid textarea/);
  assert.match(css, /customer-map-home__confirm-dock\{position:sticky/);
});
