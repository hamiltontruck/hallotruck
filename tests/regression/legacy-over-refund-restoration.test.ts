import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { calculatePaymentSummary } from "../../src/utils/paymentSummary";

const root = process.cwd();
const restorationMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260902065000_legacy_over_refund_restoration.sql"),
  "utf8",
);
const anomalyGuardMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260902065100_block_unresolved_ledger_anomaly_payments.sql"),
  "utf8",
);
const externalRefundGuardMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260902065200_restrict_legacy_restoration_to_external_refunds.sql"),
  "utf8",
);
const correctionsMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260827101439_immutable_financial_corrections.sql"),
  "utf8",
);
const referenceIntegrityMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260830022800_harden_payment_reference_integrity.sql"),
  "utf8",
);
const paymentControl = readFileSync(
  path.join(root, "src", "components", "admin", "AdminPaymentCollectionControl.tsx"),
  "utf8",
);
const paymentLedgerPanel = readFileSync(
  path.join(root, "src", "components", "admin", "AdminPaymentLedgerAnomalyPanel.tsx"),
  "utf8",
);
const paymentWorkspace = readFileSync(
  path.join(root, "src", "pages", "AdminPaymentWorkspace.tsx"),
  "utf8",
);
const restorationForm = readFileSync(
  path.join(root, "src", "components", "admin", "LegacyRefundRestorationForm.tsx"),
  "utf8",
);

const issue248Entries = [
  { amount_etb: 25_150, event: "refunded" },
  { amount_etb: 2_150, event: "released" },
  { amount_etb: 23_000, event: "released" },
  { amount_etb: 30_000, event: "refunded" },
];

test("refund > verified funds is rejected and remains visible as an anomaly", () => {
  const summary = calculatePaymentSummary(25_150, [
    { amount_etb: 25_150, event: "released" },
    { amount_etb: 55_150, event: "refunded" },
  ]);

  assert.equal(summary.rawVerified, -30_000);
  assert.equal(summary.ledgerAnomaly, 30_000);
  assert.equal(summary.verifiedPaid, 0);
  assert.match(anomalyGuardMigration, /Refund exceeds effective verified funds/i);
  assert.match(anomalyGuardMigration, /new\.amount_etb > greatest\(0, v_effective_verified\) \+ 0\.005/i);
});

test("duplicate refund is blocked by source, request and external-reference integrity guards", () => {
  assert.match(correctionsMigration, /where correction\.request_key = p_request_key[\s\S]*already processed/i);
  assert.match(correctionsMigration, /where correction\.source_payment_id = p_payment_id[\s\S]*v_remaining := greatest/i);
  assert.match(correctionsMigration, /Payment has already been fully corrected/i);
  assert.match(referenceIntegrityMigration, /payments_reference_integrity_guard/i);
  assert.match(referenceIntegrityMigration, /Transaction ID is already assigned to another payment for this provider/i);
});

test("partial refund preserves the unreversed verified balance", () => {
  const summary = calculatePaymentSummary(25_150, [
    { amount_etb: 25_150, event: "released" },
    { amount_etb: 10_000, event: "refunded" },
  ]);

  assert.equal(summary.refunded, 10_000);
  assert.equal(summary.rawVerified, 15_150);
  assert.equal(summary.verifiedPaid, 15_150);
  assert.equal(summary.balanceToPay, 10_000);
  assert.equal(summary.ledgerAnomaly, 0);
  assert.match(correctionsMigration, /v_type = 'partial_refund' and v_amount >= v_remaining/i);
  assert.match(correctionsMigration, /Partial refund must be less than the remaining payment amount/i);
});

test("legacy restoration neutralizes only the excess-refund anomaly", () => {
  const before = calculatePaymentSummary(100_000, [
    { amount_etb: 20_000, event: "released" },
    { amount_etb: 35_000, event: "refunded" },
  ]);
  assert.equal(before.rawVerified, -15_000);
  assert.equal(before.ledgerAnomaly, 15_000);
  assert.equal(before.balanceToPay, 100_000);

  const restored = calculatePaymentSummary(100_000, [
    { amount_etb: 20_000, event: "released" },
    { amount_etb: 35_000, event: "refunded" },
  ], 15_000);
  assert.equal(restored.legacyRefundRestored, 15_000);
  assert.equal(restored.rawVerified, 0);
  assert.equal(restored.verifiedPaid, 0);
  assert.equal(restored.ledgerAnomaly, 0);
  assert.equal(restored.balanceToPay, 100_000);
});

test("Issue 248 target arithmetic restores ETB 30,000 without inventing paid funds", () => {
  const restored = calculatePaymentSummary(25_150, issue248Entries, 30_000);

  assert.equal(restored.releasedGross, 25_150);
  assert.equal(restored.refunded, 55_150);
  assert.equal(restored.legacyRefundRestored, 30_000);
  assert.equal(restored.rawVerified, 0);
  assert.equal(restored.ledgerAnomaly, 0);
  assert.equal(restored.balanceToPay, 25_150);
  assert.equal(restored.customerCredit, 0);
});

test("legacy over-refund restoration cannot be applied twice", () => {
  assert.match(restorationMigration, /where correction\.source_payment_id = p_refund_payment_id[\s\S]*legacy_refund_restoration/i);
  assert.match(restorationMigration, /v_source_remaining := greatest\(round\(v_source_amount - v_source_restored, 2\), 0\)/i);
  assert.match(restorationMigration, /This legacy refund has already been fully restored/i);
  assert.match(restorationMigration, /Restoration request was already processed/i);
  assert.match(restorationMigration, /Restoration exceeds the current ledger anomaly/i);
  assert.match(restorationMigration, /Restoration exceeds the remaining legacy refund amount/i);
});

test("admin payment integrity predicate becomes clean after the corrected target restoration", () => {
  const before = calculatePaymentSummary(25_150, issue248Entries);
  const corrected = calculatePaymentSummary(25_150, issue248Entries, 30_000);
  const isIntegrityIssue = (rawVerified: number, initiated: number, invoice: number) =>
    rawVerified < 0
    || rawVerified > invoice + 0.005
    || initiated + Math.max(0, rawVerified) > invoice + 0.005;

  assert.equal(isIntegrityIssue(before.rawVerified, before.initiated, before.invoiceTotal), true);
  assert.equal(isIntegrityIssue(corrected.rawVerified, corrected.initiated, corrected.invoiceTotal), false);
  assert.match(restorationMigration, /create or replace function public\.admin_payment_integrity_report\(\)/i);
  assert.match(restorationMigration, /private\.legacy_refund_restoration_total\(payment_order\.id\)::numeric as restored_total/i);
  assert.match(restorationMigration, /released_total \+ totals\.held_total - totals\.refunded_total \+ totals\.restored_total as raw_verified/i);
  assert.match(restorationMigration, /where calc\.raw_verified < 0[\s\S]*calc\.raw_verified > calc\.invoice_total \+ 0\.005/i);
});

test("restoration never rewrites payment history or emits commissionable payment rows", () => {
  assert.match(restorationMigration, /insert into public\.financial_corrections/i);
  assert.doesNotMatch(restorationMigration, /insert into public\.payments/i);
  assert.doesNotMatch(restorationMigration, /update\s+public\.payments\s+set/i);
  assert.doesNotMatch(restorationMigration, /delete\s+from\s+public\.payments/i);
  assert.match(restorationMigration, /driver_commission_reversal_etb[\s\S]*v_amount, 0, 0, 0, 0/i);
});

test("restoration is Admin/CEO-only, evidence-backed, replay-safe and source-capped", () => {
  assert.match(restorationMigration, /not \(select private\.is_admin_or_ceo\(\)\)/i);
  assert.match(restorationMigration, /Restoration request was already processed/i);
  assert.match(restorationMigration, /External evidence reference is required/i);
  assert.match(restorationMigration, /Only a refunded payment can be restored/i);
  assert.match(restorationMigration, /Auditable financial-correction refunds cannot be restored/i);
  assert.match(restorationMigration, /Restoration exceeds the current ledger anomaly/i);
  assert.match(restorationMigration, /Restoration exceeds the remaining legacy refund amount/i);
  assert.match(restorationMigration, /revoke all on function public\.admin_restore_legacy_excess_refund[\s\S]*from public, anon/i);
});

test("final restoration RPC accepts only external Bank or Telebirr-style refund references", () => {
  assert.match(externalRefundGuardMigration, /private\.is_external_payment_reference\(v_source_provider, v_source_reference\)/i);
  assert.match(externalRefundGuardMigration, /Legacy restoration requires an external Bank \/ Telebirr payment reference/i);
  assert.match(externalRefundGuardMigration, /financial-correction refunds cannot be restored with the legacy workflow/i);
  assert.match(externalRefundGuardMigration, /not \(select private\.is_admin_or_ceo\(\)\)/i);
});

test("unresolved negative ledgers fail closed for new or advancing payments", () => {
  assert.match(anomalyGuardMigration, /v_effective_verified < -0\.005/i);
  assert.match(anomalyGuardMigration, /Resolve the ledger anomaly before adding or advancing another payment/i);
  assert.match(anomalyGuardMigration, /Refund exceeds effective verified funds/i);
  assert.match(anomalyGuardMigration, /v_pending_plus_verified := v_initiated \+ greatest\(0, v_effective_verified\)/i);
  assert.match(anomalyGuardMigration, /payment\.id <> old\.id/i);
});

test("Admin finance control exposes anomaly state before ordinary collection actions", () => {
  assert.match(paymentControl, /type PaymentState = "anomaly"/i);
  assert.match(paymentControl, /if \(summary\.ledgerAnomaly > 0\) return "anomaly"/i);
  assert.match(paymentControl, /Ledger anomaly requires Finance reconciliation/i);
  assert.match(paymentControl, /Ordinary collection actions are paused/i);
});

test("the actual Payment Ledger workspace shows reconciliation evidence and restoration action", () => {
  assert.match(paymentWorkspace, /AdminPaymentLedgerAnomalyPanel/i);
  assert.match(paymentWorkspace, /<AdminPaymentLedgerAnomalyPanel \/>/i);
  assert.match(paymentLedgerPanel, /admin_payment_integrity_report/i);
  assert.match(paymentLedgerPanel, /PAYMENT LEDGER ANOMALY/i);
  assert.match(paymentLedgerPanel, /These orders are reconciliation exceptions, not ordinary unpaid invoices/i);
  assert.match(paymentLedgerPanel, /LegacyRefundRestorationForm/i);
  assert.match(paymentLedgerPanel, /isEligibleLegacyExternalRefund/i);
  for (const provider of ["cash", "cash_to_driver", "driver_cash", "financial_correction", "credit_refund", "internal"]) {
    assert.match(paymentLedgerPanel, new RegExp(`\\"${provider}\\"`, "i"));
  }
  assert.match(paymentLedgerPanel, /provider_ref\?\.trim\(\) \?\? ""/i);
  assert.match(restorationForm, /external evidence proves/i);
  assert.match(restorationForm, /never edits or deletes the original payment row/i);
});
