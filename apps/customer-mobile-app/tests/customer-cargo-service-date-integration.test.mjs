import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const journey = source("../src/CustomerBookingJourney.tsx");
const order = source("../src/customer-order.service-v2.ts");
const copy = source("../src/customer-final-copy.ts");
const cargoCopy = source("../src/customer-cargo-items.ts");
const css = source("../src/customer-final-ui.css");

test("combined QA branch has Cargo item and required Service Date together", () => {
  const cargo = journey.slice(journey.indexOf('{step === "cargo"'), journey.indexOf('{step === "truck"'));
  const review = journey.slice(journey.indexOf('{step === "review"'));
  assert.ok(cargo.includes("{c.serviceDate}"));
  assert.ok(cargo.includes('type="date"'));
  assert.ok(cargo.includes("required"));
  assert.ok(cargo.includes("getCustomerCargoItems(cargoCategory, language).map"));
  assert.ok(cargo.includes("setCargoItem(\"\")"));
  assert.ok(cargo.includes("cargoItemError"));
  assert.ok(cargo.includes("disabled={!truckReady || !serviceDateReady}"));
  assert.ok(!review.includes('type="date"'), "Review date must be read-only");
  assert.ok(review.includes("<small>{c.serviceDate}</small>"));
  assert.ok(review.includes("getCustomerCargoItems(cargoCategory, language).find"));
  assert.ok(journey.includes("isValidCustomerServiceDate(serviceDate)"));
  assert.ok(journey.includes("validateCustomerCargoItem({ category: cargoCategory, item: cargoItem, notes: note })"));
});

test("service guards validate date and cargo item before committing to existing order contract", () => {
  assert.ok(order.includes("isValidCustomerServiceDate(input.serviceDate)"));
  assert.ok(order.includes("validateCustomerCargoItem({"));
  assert.ok(order.includes("buildCustomerCargoNotes({"));
  assert.ok(order.includes("cargo_category: input.cargoCategory"));
  assert.ok(order.includes("packaging_type: input.packagingType"));
  assert.ok(order.includes("cargo_notes: cargoNotes"));
  assert.ok(order.includes("calculate_transport_quote_v2"));
  assert.ok(order.includes("service_date: input.serviceDate"));
  assert.ok(!order.includes("cargo_item: input.cargoItem"), "No unsupported database column");
});

test("three languages cover date errors and detailed cargo item labels", () => {
  assert.equal((copy.match(/serviceDate:/g) ?? []).length, 3);
  assert.equal((copy.match(/invalidServiceDate:/g) ?? []).length, 3);
  assert.ok(cargoCopy.includes("itemPlaceholder"));
  assert.ok(cargoCopy.includes("cargo_notes_too_long"));
  for (const language of ["en:", "om:", "am:"]) assert.ok(cargoCopy.includes(language));
});

test("cargo detail selector is readable at phone sizes with horizontal overflow protection", () => {
  assert.match(css, /customer-final-select-row--cargo-item\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /customer-final-select-row--cargo-item select\s*\{[^}]*min-height:48px/);
  assert.match(css, /customer-final-select-row--cargo-item select\s*\{[^}]*font-size:16px/);
  assert.match(css, /\.customer-final-step-body\{[^}]*overflow-x:clip/);
  for (const breakpoint of [
    "@media(max-width:359px)", "@media(min-width:360px) and (max-width:389px)",
    "@media(min-width:390px)", "@media(min-width:412px)", "@media(min-width:430px)",
  ]) assert.ok(css.includes(breakpoint), breakpoint);
});
