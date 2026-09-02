import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  matchesAdminOrderControlQueue,
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
import {
  buildAdminIntelligenceReport,
  isWithinAdminReportRange,
  searchAdminIntelligence,
  type AdminIntelligenceData,
} from "../../src/domain/admin-intelligence";

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

test("every supported vehicle class has a local optimized presentation asset", () => {
  const presentationSource = readFileSync(path.join(process.cwd(), "src/domain/vehicle-presentation.ts"), "utf8");
  const customerSelector = readFileSync(path.join(process.cwd(), "src/pages/CustomerMapHome.tsx"), "utf8");

  for (const vehicleType of Object.keys(vehicleCapacityTons)) {
    assert.match(presentationSource, new RegExp(`(?:^|\\n)\\s*${JSON.stringify(vehicleType).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:`));
  }

  const assets = [
    "pickup-3-ton.webp",
    "cargo-van-5-ton.webp",
    "cab-over-box-truck-5-ton.webp",
    "dry-cargo-truck-10-ton.webp",
    "refrigerated-truck-15-ton.webp",
    "cargo-truck-22-ton.webp",
    "cargo-truck-25-ton.webp",
    "cargo-truck-30-ton.webp",
    "semi-trailer-45-ton.webp",
  ];
  for (const asset of assets) assert.equal(existsSync(path.join(process.cwd(), "public/vehicles", asset)), true, asset);
  assert.match(customerSelector, /loading="lazy"/);
  assert.match(customerSelector, /decoding="async"/);
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

test("Abiy bank-confirmed commissions consume the prepaid deposit exactly once", () => {
  const wallet = calculateDriverDepositWallet({
    depositedEtb: 10_000,
    commissionChargedEtb: 598 + 1_447 + 490,
    commissionPaidEtb: 0,
  });

  assert.equal(wallet.commissionChargedEtb, 2_535);
  assert.equal(wallet.depositConsumedEtb, 2_535);
  assert.equal(wallet.availableDepositEtb, 7_465);
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

test("driver wallet migration unifies confirmation and direct-collection commission ledgers", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20260826214927_unify_driver_commission_wallet.sql"),
    "utf8",
  );

  assert.match(migration, /private\.driver_commission_charged_total/i);
  assert.match(migration, /from public\.driver_payment_confirmations/i);
  assert.match(migration, /commission_reversed_at is null/i);
  assert.match(migration, /from public\.driver_commission_charges/i);
  assert.match(migration, /charge\.status = 'active'/i);
  assert.match(migration, /not exists[\s\S]*confirmation\.payment_id = charge\.payment_id/i);
  assert.match(migration, /create or replace function public\.driver_commission_balance/i);
  assert.match(migration, /create or replace function public\.my_driver_commission_summary/i);
  assert.match(migration, /create or replace function public\.driver_financial_summary/i);
  assert.match(migration, /from public\.profiles profile[\s\S]*profile\.role::text in \('admin', 'ceo'\)/i);
  assert.match(migration, /revoke all on function private\.driver_commission_charged_total\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.driver_financial_summary\(uuid\)[\s\S]*to authenticated, service_role/i);
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data/i);
  assert.doesNotMatch(migration, /app_metadata[^\n]*role/i);
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
  assert.equal(matchesPaymentLedgerStatus("refunded", "refunded"), true);
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

test("Admin control-center drilldowns reproduce exception queue rules", () => {
  const now = new Date("2026-08-25T12:00:00.000Z").getTime();
  const base = {
    id: "order-1",
    tracking_id: "HT-CONTROL-1",
    customer_name: "Customer",
    pickup_address: "A",
    dropoff_address: "B",
    status: "in_transit",
    payment_status: "released",
    driver_id: "driver-1",
    truck_id: "truck-1",
    accepted_at: "2026-08-22T10:00:00.000Z",
    delivered_at: null,
    created_at: "2026-08-22T09:00:00.000Z",
  };

  assert.equal(matchesAdminOrderControlQueue(base, "delayed", new Set(), new Set(), now), true);
  assert.equal(matchesAdminOrderControlQueue({ ...base, id: "unassigned", driver_id: null }, "unassigned", new Set(), new Set(), now), true);
  assert.equal(matchesAdminOrderControlQueue({ ...base, id: "delivered", status: "delivered" }, "missing-evidence"), true);
  assert.equal(matchesAdminOrderControlQueue({ ...base, id: "proved", status: "delivered" }, "missing-evidence", new Set(["proved"])), false);
  assert.equal(matchesAdminOrderControlQueue({ ...base, id: "legacy", status: "delivered" }, "missing-evidence", new Set(), new Set(["legacy"])), false);
});

test("Admin command center exposes deep-linked controls and no obsolete Driver evidence instruction", () => {
  const overview = readFileSync(path.join(process.cwd(), "src/pages/AdminCeoOverview.tsx"), "utf8");
  const workspace = readFileSync(path.join(process.cwd(), "src/pages/AdminPaymentWorkspace.tsx"), "utf8");
  const service = readFileSync(path.join(process.cwd(), "src/services/admin-control-center.service.ts"), "utf8");
  assert.match(overview, /queue=delayed/);
  assert.match(overview, /queue=missing-evidence/);
  assert.match(overview, /status=pending/);
  assert.match(overview, /action=create-order/);
  assert.doesNotMatch(workspace, /attach evidence|ragaa itti maxxansuun|ku lifaaqaa caddayn/i);
  assert.match(workspace, /No receipt or evidence upload is required/);
  assert.match(service, /Driver finance unavailable/);
  assert.match(overview, /partial finance data/);
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

function intelligenceFixture(): AdminIntelligenceData {
  const order = (overrides: Partial<AdminIntelligenceData["orders"][number]> = {}): AdminIntelligenceData["orders"][number] => ({
    id: "order-1",
    tracking_id: "HT-2026-SEARCH1",
    customer_name: "Sofi Husse",
    customer_phone: "+251913509926",
    pickup_address: "Addis Ababa",
    dropoff_address: "Adama",
    cargo_description: "Coffee",
    vehicle_type: "Dry Cargo",
    price_etb: 1_000,
    status: "delivered",
    payment_status: "released",
    driver_id: "driver-1",
    truck_id: "truck-1",
    accepted_at: "2026-08-25T08:00:00.000Z",
    delivered_at: "2026-08-25T10:00:00.000Z",
    cancellation_reason: null,
    cancellation_source: null,
    cancelled_at: null,
    created_at: "2026-08-25T08:00:00.000Z",
    ...overrides,
  });
  const paymentRow = (overrides: Partial<AdminIntelligenceData["payments"][number]> = {}): AdminIntelligenceData["payments"][number] => ({
    id: "payment-1",
    order_id: "order-1",
    provider: "telebirr",
    provider_ref: "TEL-20260825-001",
    amount_etb: 1_000,
    event: "released",
    receipt_path: "receipt.jpg",
    created_at: "2026-08-25T10:00:00.000Z",
    ...overrides,
  });

  return {
    orders: [
      order(),
      order({ id: "order-2", tracking_id: "HT-2026-UNASSIGNED", customer_name: "Ali", customer_phone: "+251900000002", pickup_address: "Mojo", dropoff_address: "Dire Dawa", price_etb: 500, status: "placed", payment_status: "pending", driver_id: null, truck_id: null, accepted_at: null, delivered_at: null, created_at: "2026-08-20T08:00:00.000Z" }),
      order({ id: "order-old", tracking_id: "HT-2026-OLD", status: "cancelled", payment_status: "unpaid", driver_id: null, truck_id: null, accepted_at: null, delivered_at: null, cancellation_reason: "Other order", cancellation_source: "customer", cancelled_at: "2026-07-01T09:00:00.000Z", created_at: "2026-07-01T08:00:00.000Z" }),
    ],
    payments: [
      paymentRow(),
      paymentRow({ id: "payment-refund", provider_ref: "TEL-REFUND", amount_etb: 100, event: "refunded" }),
      paymentRow({ id: "payment-pending", order_id: "order-2", provider: "cbe", provider_ref: "CBE-20260824-001", amount_etb: 500, event: "initiated", created_at: "2026-08-24T10:00:00.000Z" }),
    ],
    customers: [{ id: "customer-1", full_name: "Sofi Husse", phone: "+251913509926", email: "sofi@example.com", company_name: "Sofi Logistics", is_credit_customer: true, created_at: "2026-08-25T07:00:00.000Z" }],
    drivers: [{ id: "driver-1", full_name: "Mebruk", phone: "+251911766093", driver_status: "approved" }],
    trucks: [{ id: "truck-1", plate_number: "3-A12345", vehicle_type: "Dry Cargo", capacity_tons: 12, status: "assigned", created_at: "2026-08-01T08:00:00.000Z" }],
  };
}

test("Admin report ranges use exact local-day boundaries", () => {
  const now = new Date(2026, 7, 25, 12, 0, 0, 0);
  const localIso = (day: number, hour: number, minute: number, second: number, millisecond = 0) =>
    new Date(2026, 7, day, hour, minute, second, millisecond).toISOString();

  assert.equal(isWithinAdminReportRange(localIso(25, 0, 0, 0), "today", now), true);
  assert.equal(isWithinAdminReportRange(localIso(24, 23, 59, 59, 999), "today", now), false);
  assert.equal(isWithinAdminReportRange(localIso(19, 0, 0, 0), "7d", now), true);
  assert.equal(isWithinAdminReportRange(localIso(18, 23, 59, 59, 999), "7d", now), false);
});

test("Admin global search preserves transaction, driver, phone and plate context", () => {
  const data = intelligenceFixture();
  assert.equal(searchAdminIntelligence(data, "TEL-20260825-001").payments.length, 1);
  assert.equal(searchAdminIntelligence(data, "Mebruk").drivers.length, 1);
  assert.equal(searchAdminIntelligence(data, "+251911766093").payments.length, 2);
  assert.equal(searchAdminIntelligence(data, "3-A12345").trucks.length, 1);
  assert.equal(searchAdminIntelligence(data, "Addis Ababa").orders.length, 2);
});

test("Admin intelligence report reconciles finance, assignment and route signals", () => {
  const report = buildAdminIntelligenceReport(intelligenceFixture(), "7d", new Date("2026-08-25T12:00:00.000Z"));
  assert.equal(report.orders.length, 2);
  assert.equal(report.netRevenue, 900);
  assert.equal(report.pendingEtb, 500);
  assert.equal(report.unassigned.length, 1);
  assert.equal(report.completionRate, 50);
  assert.equal(report.fleetUtilization, 100);
  assert.equal(report.topRoutes[0].route, "Addis Ababa → Adama");
});
