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
const paymentControl = readFileSync(
  path.join(root, "src", "components", "admin", "AdminPaymentCollectionControl.tsx"),
  "utf8",
);
const restorationForm = readFileSync(
  path.join(root, "src", "components", "admin", "LegacyRefundRestorationForm.tsx"),
  "utf8",
);

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
  const restored = calculatePaymentSummary(25_150, [
    { amount_etb: 25_150, event: "refunded" },
    { amount_etb: 2_150, event: "released" },
    { amount_etb: 23_000, event: "released" },
    { amount_etb: 30_000, event: "refunded" },
  ], 30_000);

  assert.equal(restored.releasedGross, 25_150);
  assert.equal(restored.refunded, 55_150);
  assert.equal(restored.legacyRefundRestored, 30_000);
  assert.equal(restored.rawVerified, 0);
  assert.equal(restored.ledgerAnomaly, 0);
  assert.equal(restored.balanceToPay, 25_150);
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
  assert.match(paymentControl, /LegacyRefundRestorationForm/i);
  assert.match(restorationForm, /external evidence proves/i);
  assert.match(restorationForm, /never edits or deletes the original payment row/i);
});
