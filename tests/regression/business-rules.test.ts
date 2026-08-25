import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
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
import { getDriverPaymentSubmissionIssue } from "../../src/domain/driver-payment-collection";
import {
  buildPasswordResetRedirectUrl,
  isPasswordRecoveryLocation,
  recoveryLoginHash,
  recoveryPortalFromRole,
} from "../../src/domain/password-recovery";
import {
  calculateDriverDepositWallet,
  isDriverDepositAmountAllowed,
  MAX_DRIVER_DEPOSIT_ETB,
  MIN_DRIVER_DEPOSIT_ETB,
} from "../../src/domain/driver-deposit";
import { getDriverOnboardingProgress } from "../../src/domain/driver-onboarding";

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

test("driver collection requires an explicit safe payment choice", () => {
  assert.equal(getDriverPaymentSubmissionIssue(null, false), "method_required");
  assert.equal(getDriverPaymentSubmissionIssue("cash", false), null);
  assert.equal(getDriverPaymentSubmissionIssue("bank", false), "evidence_required");
  assert.equal(getDriverPaymentSubmissionIssue("bank", true), null);
});

test("password recovery returns each account role to the correct login", () => {
  assert.equal(recoveryPortalFromRole("customer"), "customer");
  assert.equal(recoveryPortalFromRole("driver"), "driver");
  assert.equal(recoveryPortalFromRole("ceo"), "admin");
  assert.equal(recoveryPortalFromRole("unknown"), "account");
  assert.equal(recoveryLoginHash("customer"), "#/customer/login");
  assert.equal(recoveryLoginHash("driver"), "#/driver/login");
  assert.equal(recoveryLoginHash("admin"), "#/admin");
});

test("password recovery recognizes only recovery links and keeps the approved base redirect", () => {
  assert.equal(isPasswordRecoveryLocation("https://example.com/hallotruck/#access_token=token&type=recovery"), true);
  assert.equal(isPasswordRecoveryLocation("https://example.com/hallotruck/#access_token=token&type=signup"), false);
  assert.equal(isPasswordRecoveryLocation("https://example.com/hallotruck/#access_token=token"), false);
  assert.equal(buildPasswordResetRedirectUrl("https://hamiltontruck.github.io", "/hallotruck/"), "https://hamiltontruck.github.io/hallotruck/");
});

test("driver deposit balance reconciles approved commission payments before consuming the wallet", () => {
  const wallet = calculateDriverDepositWallet({
    depositedEtb: 100_000,
    commissionChargedEtb: 18_678,
    commissionPaidEtb: 18_272,
  });

  assert.equal(wallet.unpaidCommissionEtb, 406);
  assert.equal(wallet.depositConsumedEtb, 406);
  assert.equal(wallet.availableDepositEtb, 99_594);
  assert.equal(wallet.commissionDueEtb, 0);
});

test("driver deposit balance never becomes negative when unpaid commission exceeds the wallet", () => {
  const wallet = calculateDriverDepositWallet({
    depositedEtb: 5_000,
    commissionChargedEtb: 10_000,
    commissionPaidEtb: 2_000,
  });

  assert.equal(wallet.unpaidCommissionEtb, 8_000);
  assert.equal(wallet.depositConsumedEtb, 5_000);
  assert.equal(wallet.availableDepositEtb, 0);
  assert.equal(wallet.commissionDueEtb, 3_000);
});

test("driver deposit amount guard enforces the shared ETB 5,000-100,000 limits", () => {
  assert.equal(isDriverDepositAmountAllowed(MIN_DRIVER_DEPOSIT_ETB - 1), false);
  assert.equal(isDriverDepositAmountAllowed(MIN_DRIVER_DEPOSIT_ETB), true);
  assert.equal(isDriverDepositAmountAllowed(MAX_DRIVER_DEPOSIT_ETB), true);
  assert.equal(isDriverDepositAmountAllowed(MAX_DRIVER_DEPOSIT_ETB + 1), false);
  assert.equal(isDriverDepositAmountAllowed(Number.NaN), false);
});

test("driver deposit migration removes bypass paths and restricts audited RPCs", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20260825133000_harden_driver_deposit_wallet.sql"),
    "utf8",
  );

  assert.match(migration, /drop policy if exists driver_commission_deposits_admin_write/i);
  assert.match(migration, /revoke insert, update, delete on table public\.driver_commission_deposits\s+from anon, authenticated/i);
  assert.match(migration, /drop function if exists public\.admin_add_driver_commission_deposit\(uuid,numeric,text\)/i);
  assert.match(migration, /revoke all on function public\.admin_record_driver_deposit\(uuid,numeric,text,text\)\s+from public, anon/i);
  assert.match(migration, /revoke all on function public\.admin_reverse_driver_commission_deposit\(uuid,text\)\s+from public, anon/i);
  assert.match(migration, /driver_deposit_added/);
  assert.match(migration, /driver_deposit_reversed/);
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

test("driver onboarding always counts identity and vehicle requirements", () => {
  const progress = getDriverOnboardingProgress([
    { document_key: "driver_photo", status: "verified" },
    { document_key: "license_front", status: "verified" },
    { document_key: "license_back", status: "verified" },
    { document_key: "national_id_front", status: "verified" },
    { document_key: "national_id_back", status: "verified" },
  ]);

  assert.equal(progress.identityVerified, 5);
  assert.equal(progress.vehicleVerified, 0);
  assert.equal(progress.verified, 5);
  assert.equal(progress.required, 12);
  assert.equal(progress.percent, 42);
  assert.equal(progress.missing, 7);
});

test("CEO finance KPIs reconcile driver deposits and commission due", () => {
  const data: ControlCenterData = {
    orders: [],
    payments: [],
    trucks: [],
    drivers: [],
    customers: [],
    proofs: [],
    documents: [],
    driverFinancialSummaries: [
      {
        driver_id: "driver-1",
        completed_trips: 4,
        gross_released_etb: 220_000,
        commission_charged_etb: 18_678,
        commission_paid_etb: 18_272,
        admin_deposit_etb: 100_000,
        available_deposit_etb: 99_594,
        commission_due_etb: 0,
      },
      {
        driver_id: "driver-2",
        completed_trips: 1,
        gross_released_etb: 50_000,
        commission_charged_etb: 3_000,
        commission_paid_etb: 0,
        admin_deposit_etb: 5_000,
        available_deposit_etb: 5_000,
        commission_due_etb: 3_000,
      },
    ],
  };

  const view = buildControlCenterView(data, new Date("2026-08-25T12:00:00.000Z"));
  assert.equal(view.totalDriverDeposit, 105_000);
  assert.equal(view.availableDriverDeposit, 104_594);
  assert.equal(view.driverCommissionReceivable, 3_000);
});
