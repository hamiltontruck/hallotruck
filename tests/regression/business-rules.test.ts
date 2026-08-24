import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCargoDescription,
  isContainerPackaging,
  validateCargoDetails,
} from "../../src/domain/cargo-details";
import {
  cargoToTons,
  formatCargoLoad,
  validateCargoLoad,
  vehicleCapacityTons,
} from "../../src/domain/cargo-load";
import { calculatePaymentSummary } from "../../src/utils/paymentSummary";

test("cargo units convert to actual tons", () => {
  assert.equal(cargoToTons(50, "quintal"), 5);
  assert.equal(cargoToTons(1.5, "ton"), 1.5);
  assert.equal(cargoToTons(0, "ton"), 0);
  assert.equal(cargoToTons(Number.NaN, "quintal"), 0);
});

test("vehicle capacities and cargo validation stay aligned", () => {
  assert.equal(vehicleCapacityTons["isuzu 5 ton"], 5);
  assert.equal(vehicleCapacityTons.trailer, 45);
  assert.equal(validateCargoLoad("Isuzu 5 Ton", 50, "quintal"), 5);
  assert.equal(validateCargoLoad("Trailer", 450, "quintal"), 45);
  assert.throws(
    () => validateCargoLoad("Isuzu 5 Ton", 51, "quintal"),
    /supports up to 5 tons/,
  );
  assert.throws(
    () => validateCargoLoad("Trailer", 0, "ton"),
    /greater than zero/,
  );
});

test("formatted cargo load preserves the entered unit", () => {
  assert.equal(formatCargoLoad(50, "quintal"), "50 quintal");
  assert.equal(formatCargoLoad(1, "ton"), "1 ton");
});

test("container loads require a trailer", () => {
  assert.equal(isContainerPackaging("container_20ft"), true);
  assert.equal(isContainerPackaging("container_40ft"), true);
  assert.equal(isContainerPackaging("bagged"), false);

  assert.equal(validateCargoDetails({
    category: "general_goods",
    packagingType: "container_20ft",
    vehicleType: "Trailer",
  }), null);

  assert.equal(validateCargoDetails({
    category: "general_goods",
    packagingType: "container_40ft",
    vehicleType: "Dry Cargo",
  }), "container_requires_trailer");
});

test("Other cargo requires a useful description", () => {
  assert.equal(validateCargoDetails({
    category: "other",
    packagingType: "pallet",
    vehicleType: "Dry Cargo",
    notes: "",
  }), "other_details_required");

  assert.equal(validateCargoDetails({
    category: "other",
    packagingType: "pallet",
    vehicleType: "Dry Cargo",
    notes: "Medical supplies",
  }), null);
});

test("cargo description remains structured and auditable", () => {
  assert.equal(buildCargoDescription({
    category: "grain_rice",
    packagingType: "bagged",
    load: "50 quintal",
    notes: "White rice",
  }), "Grain / rice · Bagged · 50 quintal · White rice");
});

test("unverified payment never becomes driver earnings", () => {
  const summary = calculatePaymentSummary(100_000, [
    { amount_etb: 100_000, event: "initiated" },
  ]);

  assert.equal(summary.pendingVerification, 100_000);
  assert.equal(summary.verifiedPaid, 0);
  assert.equal(summary.balanceToPay, 100_000);
  assert.equal(summary.remainingToSubmit, 0);
});

test("verified and released payment clears the invoice balance", () => {
  const summary = calculatePaymentSummary(100_000, [
    { amount_etb: 100_000, event: "released" },
  ]);

  assert.equal(summary.verifiedPaid, 100_000);
  assert.equal(summary.pendingVerification, 0);
  assert.equal(summary.balanceToPay, 0);
  assert.equal(summary.customerCredit, 0);
});

test("held escrow is verified but not released", () => {
  const summary = calculatePaymentSummary(100_000, [
    { amount_etb: 60_000, event: "held_escrow" },
  ]);

  assert.equal(summary.heldEscrow, 60_000);
  assert.equal(summary.releasedGross, 0);
  assert.equal(summary.verifiedPaid, 60_000);
  assert.equal(summary.balanceToPay, 40_000);
});

test("refunds reopen only the refunded balance", () => {
  const summary = calculatePaymentSummary(100_000, [
    { amount_etb: 100_000, event: "released" },
    { amount_etb: 20_000, event: "refunded" },
  ]);

  assert.equal(summary.verifiedPaid, 80_000);
  assert.equal(summary.balanceToPay, 20_000);
  assert.equal(summary.remainingToSubmit, 20_000);
});

test("overpayment is represented as customer credit", () => {
  const summary = calculatePaymentSummary(100_000, [
    { amount_etb: 110_000, event: "released" },
  ]);

  assert.equal(summary.balanceToPay, 0);
  assert.equal(summary.customerCredit, 10_000);
});

test("refunds beyond verified funds are flagged as a ledger anomaly", () => {
  const summary = calculatePaymentSummary(100_000, [
    { amount_etb: 20_000, event: "released" },
    { amount_etb: 35_000, event: "refunded" },
  ]);

  assert.equal(summary.rawVerified, -15_000);
  assert.equal(summary.verifiedPaid, 0);
  assert.equal(summary.ledgerAnomaly, 15_000);
  assert.equal(summary.balanceToPay, 100_000);
});
