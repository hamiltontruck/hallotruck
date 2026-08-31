import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatWalletEtb,
  normalizeDriverCommissionSummary,
  normalizeDriverFinancialSummary,
  normalizeDriverWalletTrips,
  walletResultLabel,
} from "../.test-dist-wallet/driver-wallet.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-wallet.service.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../src/driver/DriverWalletView.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("normalizes complete financial summary without false defaults", () => {
  const summary = normalizeDriverFinancialSummary([{
    completed_trips: 4,
    gross_released_etb: "120000",
    commission_charged_etb: 2400,
    commission_paid_etb: 500,
    admin_deposit_etb: 10000,
    available_deposit_etb: 8100,
    commission_due_etb: 0,
  }]);
  assert.equal(summary.completedTrips, 4);
  assert.equal(summary.availableDepositEtb, 8100);
  assert.throws(() => normalizeDriverFinancialSummary([]), /unavailable/);
  assert.throws(() => normalizeDriverFinancialSummary([{ completed_trips: 1 }]), /invalid/);
});

test("normalizes commission summary and requires a boolean job lock", () => {
  const summary = normalizeDriverCommissionSummary({
    balance_etb: 0,
    charged_etb: 2500,
    approved_paid_etb: 500,
    pending_etb: 0,
    blocked: false,
  });
  assert.equal(summary.blocked, false);
  assert.throws(() => normalizeDriverCommissionSummary({ balance_etb: 0, blocked: "false" }), /blocked/);
});

test("normalizes only valid self-scoped trip result rows", () => {
  const trips = normalizeDriverWalletTrips([{
    id: "result-1",
    order_id: "order-1",
    result_type: "cash_received",
    amount_collected: 50000,
    payment_method: "cash",
    completed_at: "2026-08-31T10:00:00Z",
    commission_etb: 1000,
    driver_gross_etb: 50000,
    driver_net_etb: 49000,
    deposit_consumed_etb: 1000,
    commission_due_after_etb: 0,
    orders: { tracking_id: "HT-2026-1", pickup_address: "Adama", dropoff_address: "Finfinnee" },
  }, { id: "broken" }]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].netEtb, 49000);
  assert.equal(trips[0].trackingId, "HT-2026-1");
});

test("formats unknown money without a false zero", () => {
  assert.equal(formatWalletEtb(null), "—");
  assert.equal(formatWalletEtb(1234.6), "ETB 1,235");
  assert.equal(walletResultLabel("payment_not_received"), "Payment outstanding");
});

test("wallet service uses canonical self-scoped production sources", () => {
  assert.match(serviceSource, /driver_financial_summary/);
  assert.match(serviceSource, /my_driver_commission_summary/);
  assert.match(serviceSource, /driver_trip_payment_results/);
  assert.match(serviceSource, /\.eq\("assigned_driver_id", expectedUserId\)/);
  assert.match(serviceSource, /user\.id !== expectedUserId/);
  assert.doesNotMatch(serviceSource, /service_role|user_metadata|app_metadata/);
});

test("wallet realtime subscriptions remain Driver-filtered", () => {
  for (const table of [
    "driver_commission_deposits",
    "driver_commission_charges",
    "driver_commission_payments",
    "driver_payment_confirmations",
    "driver_trip_payment_results",
  ]) assert.match(serviceSource, new RegExp(table));
  assert.match(serviceSource, /driver_id=eq\.\$\{userId\}/);
  assert.match(serviceSource, /assigned_driver_id=eq\.\$\{userId\}/);
});

test("wallet component loads sources independently and preserves confirmed snapshots", () => {
  assert.match(componentSource, /Promise\.allSettled/);
  assert.match(componentSource, /inFlightRef/);
  assert.match(componentSource, /queuedRefreshRef/);
  assert.match(componentSource, /requestIdRef/);
  assert.match(componentSource, /setFinancial\(financialResult\.value\)/);
  assert.match(componentSource, /setCommission\(commissionResult\.value\)/);
  assert.match(componentSource, /setTrips\(tripsResult\.value\)/);
});

test("App routes only Driver wallet to the production wallet view", () => {
  assert.match(appSource, /DriverWalletView/);
  assert.match(appSource, /role === "driver"/);
  assert.match(appSource, /CustomerPaymentsView/);
});
