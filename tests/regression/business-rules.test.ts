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
import {
  buildControlCenterView,
  canonicalPayments,
  isDelayedOrder,
  isLegacyCompletedPayment,
} from "../../src/domain/admin-control-center";
import {
  getPaymentLedgerIndicators,
  getPaymentLedgerPage,
  isLegacyCompletedLedgerPayment,
  matchesPaymentLedgerDate,
  matchesPaymentLedgerSearch,
  matchesPaymentLedgerStatus,
} from "../../src/domain/payment-ledger";
import type { ControlCenterData, ControlPayment } from "../../src/services/admin-control-center.service";
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
  assert.throws(() => validateCargoLoad("Isuzu 5 Ton", 51, "quintal"), /supports up to 5 tons/);
  assert.throws(() => validateCargoLoad("Trailer", 0, "ton"), /greater than zero/);
});

test("formatted cargo load preserves the entered unit", () => {
  assert.equal(formatCargoLoad(50, "quintal"), "50 quintal");
  assert.equal(formatCargoLoad(1, "ton"), "1 ton");
});

test("container loads require a trailer", () => {
  assert.equal(isContainerPackaging("container_20ft"), true);
  assert.equal(isContainerPackaging("container_40ft"), true);
  assert.equal(isContainerPackaging("bagged"), false);
  assert.equal(validateCargoDetails({ category: "general_goods", packagingType: "container_20ft", vehicleType: "Trailer" }), null);
  assert.equal(validateCargoDetails({ category: "general_goods", packagingType: "container_40ft", vehicleType: "Dry Cargo" }), "container_requires_trailer");
});

test("Other cargo requires a useful description", () => {
  assert.equal(validateCargoDetails({ category: "other", packagingType: "pallet", vehicleType: "Dry Cargo", notes: "" }), "other_details_required");
  assert.equal(validateCargoDetails({ category: "other", packagingType: "pallet", vehicleType: "Dry Cargo", notes: "Medical supplies" }), null);
});

test("cargo description remains structured and auditable", () => {
  assert.equal(buildCargoDescription({ category: "grain_rice", packagingType: "bagged", load: "50 quintal", notes: "White rice" }), "Grain / rice · Bagged · 50 quintal · White rice");
});

test("unverified payment never becomes driver earnings", () => {
  const summary = calculatePaymentSummary(100_000, [{ amount_etb: 100_000, event: "initiated" }]);
  assert.equal(summary.pendingVerification, 100_000);
  assert.equal(summary.verifiedPaid, 0);
  assert.equal(summary.balanceToPay, 100_000);
  assert.equal(summary.remainingToSubmit, 0);
});

test("verified and released payment clears the invoice balance", () => {
  const summary = calculatePaymentSummary(100_000, [{ amount_etb: 100_000, event: "released" }]);
  assert.equal(summary.verifiedPaid, 100_000);
  assert.equal(summary.pendingVerification, 0);
  assert.equal(summary.balanceToPay, 0);
  assert.equal(summary.customerCredit, 0);
});

test("held escrow is verified but not released", () => {
  const summary = calculatePaymentSummary(100_000, [{ amount_etb: 60_000, event: "held_escrow" }]);
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
  const summary = calculatePaymentSummary(100_000, [{ amount_etb: 110_000, event: "released" }]);
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

function payment(overrides: Partial<ControlPayment>): ControlPayment {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    order_id: overrides.order_id ?? "order-1",
    provider: overrides.provider ?? "cbe",
    provider_ref: overrides.provider_ref ?? "REF-1",
    amount_etb: overrides.amount_etb ?? 50_000,
    event: overrides.event ?? "released",
    receipt_path: overrides.receipt_path ?? null,
    raw_payload: overrides.raw_payload ?? null,
    created_at: overrides.created_at ?? "2026-08-25T09:00:00.000Z",
  };
}

test("duplicate payment events are counted once in CEO totals", () => {
  const duplicateA = payment({ id: "a", provider_ref: "CBE-1" });
  const duplicateB = payment({ id: "b", provider_ref: "cbe-1" });
  const unique = payment({ id: "c", provider_ref: "CBE-2", amount_etb: 20_000 });
  assert.equal(canonicalPayments([duplicateA, duplicateB, unique]).length, 2);
});

test("legacy completed released payment is recognized", () => {
  const legacy = payment({ raw_payload: { legacy_completed: true } });
  assert.equal(isLegacyCompletedPayment(legacy), true);
});

test("payment ledger search covers every finance lookup field", () => {
  const record = {
    provider: "cbe",
    transactionId: "cbe20260805-001",
    trackingId: "HT-2026-F44A0E",
    customerName: "Sofi Husse",
    customerPhone: "+251913509926",
    pickupAddress: "Hirna, West Harerghe",
    dropoffAddress: "Dessie, South Wollo",
    driverName: "Adil Abdu",
    driverPhone: "+251900000001",
  };

  for (const query of ["f44a0e", "sofi", "913509926", "adil", "900000001", "hirna", "dessie", "cbe20260805-001"]) {
    assert.equal(matchesPaymentLedgerSearch(record, query), true, `expected ${query} to match`);
  }
  assert.equal(matchesPaymentLedgerSearch(record, "unknown payment"), false);
});

test("payment ledger status and date filters use exact finance states", () => {
  assert.equal(matchesPaymentLedgerStatus("initiated", "pending"), true);
  assert.equal(matchesPaymentLedgerStatus("failed", "rejected"), true);
  assert.equal(matchesPaymentLedgerStatus("held_escrow", "escrow"), true);
  assert.equal(matchesPaymentLedgerStatus("released", "released"), true);
  assert.equal(matchesPaymentLedgerStatus("released", "pending"), false);

  const now = new Date("2026-08-25T12:00:00.000Z");
  assert.equal(matchesPaymentLedgerDate("2026-08-25T09:00:00.000Z", "today", now), true);
  assert.equal(matchesPaymentLedgerDate("2026-08-18T12:00:00.000Z", "7d", now), true);
  assert.equal(matchesPaymentLedgerDate("2026-08-18T11:59:59.000Z", "7d", now), false);
  assert.equal(matchesPaymentLedgerDate("not-a-date", "30d", now), false);
});

test("payment ledger indicators distinguish mismatch direction and missing receipts", () => {
  const overpaid = getPaymentLedgerIndicators({ invoiceTotal: 50_000, paymentAmount: 65_500, hasOrder: true, hasReceipt: false, evidenceRequired: true });
  assert.equal(overpaid.invoiceMismatch, true);
  assert.equal(overpaid.overpaymentEtb, 15_500);
  assert.equal(overpaid.underpaymentEtb, 0);
  assert.equal(overpaid.missingReceipt, true);

  const underpaid = getPaymentLedgerIndicators({ invoiceTotal: 50_000, paymentAmount: 20_000, hasOrder: true, hasReceipt: true, evidenceRequired: true });
  assert.equal(underpaid.invoiceMismatch, true);
  assert.equal(underpaid.overpaymentEtb, 0);
  assert.equal(underpaid.underpaymentEtb, 30_000);
  assert.equal(underpaid.missingReceipt, false);
});

test("legacy completed ledger rows never require receipt evidence", () => {
  assert.equal(isLegacyCompletedLedgerPayment("released", true), true);
  assert.equal(isLegacyCompletedLedgerPayment("initiated", true), false);
  const legacy = getPaymentLedgerIndicators({ invoiceTotal: 65_500, paymentAmount: 65_500, hasOrder: true, hasReceipt: false, evidenceRequired: false });
  assert.equal(legacy.missingReceipt, false);
});

test("payment ledger pagination clamps stale pages after filtering", () => {
  assert.deepEqual(getPaymentLedgerPage(25, 4, 12), { page: 3, pageCount: 3, startIndex: 24, endIndex: 25 });
  assert.deepEqual(getPaymentLedgerPage(0, 8, 12), { page: 1, pageCount: 1, startIndex: 0, endIndex: 0 });
});

test("delayed active order is detected after 48 hours", () => {
  const now = new Date("2026-08-25T12:00:00.000Z").getTime();
  assert.equal(isDelayedOrder({
    id: "o1",
    tracking_id: "HT-1",
    customer_name: "Customer",
    pickup_address: "A",
    dropoff_address: "B",
    status: "in_transit",
    payment_status: "released",
    driver_id: "d1",
    truck_id: "t1",
    accepted_at: "2026-08-22T10:00:00.000Z",
    delivered_at: null,
    created_at: "2026-08-22T09:00:00.000Z",
  }, now), true);
});

test("legacy delivered order is excluded from missing evidence queue", () => {
  const data: ControlCenterData = {
    orders: [{
      id: "order-legacy",
      tracking_id: "HT-LEGACY",
      customer_name: "Customer",
      pickup_address: "A",
      dropoff_address: "B",
      status: "delivered",
      payment_status: "released",
      driver_id: "driver-1",
      truck_id: "truck-1",
      accepted_at: "2026-08-20T09:00:00.000Z",
      delivered_at: "2026-08-21T09:00:00.000Z",
      created_at: "2026-08-19T09:00:00.000Z",
    }],
    payments: [payment({ order_id: "order-legacy", raw_payload: { legacy_completed: true } })],
    trucks: [],
    drivers: [],
    customers: [],
    proofs: [],
    documents: [],
  };
  const view = buildControlCenterView(data, new Date("2026-08-25T12:00:00.000Z"));
  assert.equal(view.legacyOrderIds.has("order-legacy"), true);
  assert.equal(view.missingEvidenceOrders.length, 0);
});
