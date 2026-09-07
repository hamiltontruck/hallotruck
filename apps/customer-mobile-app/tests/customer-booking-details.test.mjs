import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const flow = fs.readFileSync(new URL("../src/CustomerBookingFlowV2.tsx", import.meta.url), "utf8");
const cargo = fs.readFileSync(new URL("../src/customer-cargo-contract.ts", import.meta.url), "utf8");

test("Customer booking keeps handling notes explicitly optional", () => {
  assert.match(flow, /const \[cargoDetailsOpen, setCargoDetailsOpen\] = useState\(false\)/);
  assert.match(flow, /const \[cargoNotes, setCargoNotes\] = useState\(""\)/);
  assert.match(flow, /aria-controls="customer-cargo-details"/);
  assert.match(flow, /id="customer-cargo-details"/);
  assert.match(flow, /maxLength=\{500\}/);
  assert.match(flow, /\{text\.notes\} <b>\{text\.optional\}<\/b>/);
  assert.match(flow, /\{text\.notesHelp\}/);
  assert.doesNotMatch(flow, /<textarea[\s\S]{0,500}\srequired(?:=|\s|>)/);
  assert.doesNotMatch(cargo, /"other",\s*\] as const;[\s\S]*CustomerCargoCategory/);
});

test("required booking inputs and quote readiness gate Confirm Order", () => {
  assert.match(flow, /const routeReady = Boolean/);
  assert.match(flow, /const truckReady = Boolean/);
  assert.match(flow, /const cargoReady = Boolean/);
  assert.match(flow, /const loadReady = cargoTons > 0 && cargoTons <= truck\.capacityTons/);
  assert.match(flow, /const quoteReady = Boolean/);
  assert.match(flow, /const paymentReady = paymentMethod === "cash" \|\| paymentMethod === "bank_telebirr"/);
  assert.match(flow, /const isFormReady = routeReady && truckReady && cargoReady && loadReady && quoteReady && paymentReady/);
  assert.match(flow, /type="number"/);
  assert.match(flow, /name="customer-payment-method"/);
  assert.match(flow, /disabled=\{!isFormReady \|\| submitting\}/);
});

test("container packaging stays on the existing Trailer rule without making notes required", () => {
  assert.match(flow, /validateCustomerCargoDetails\(\{ packagingType, vehicleType: truck\.label \}\)/);
  assert.match(flow, /CUSTOMER_PACKAGING_TYPES\.map/);
  assert.match(flow, /next === "container_20ft" \|\| next === "container_40ft"/);
  assert.match(flow, /onTruckChange\("trailer"\)/);
  assert.match(cargo, /container_requires_trailer/);
});
