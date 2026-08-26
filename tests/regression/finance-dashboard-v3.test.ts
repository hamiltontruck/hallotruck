import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalCommissionAccrued, computeFinanceSummary, dailySeries, type FinanceDashboardData } from "../../src/domain/finance-dashboard";

const accessMigration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260826221314_fix_finance_dashboard_access.sql"),
  "utf8",
);

const now = new Date("2026-08-26T12:00:00Z");
const data: FinanceDashboardData = {
  payments: [
    { id: "p1", order_id: "o1", provider: "cbe", provider_ref: "CBE-1", amount_etb: 100000, event: "released", created_at: "2026-08-26T10:00:00Z", reviewed_at: "2026-08-26T10:30:00Z" },
    { id: "p2", order_id: "o2", provider: "telebirr", provider_ref: "TEL-1", amount_etb: 25000, event: "held_escrow", created_at: "2026-08-24T10:00:00Z" },
    { id: "p3", order_id: "o3", provider: "cbe", provider_ref: "CBE-R", amount_etb: 5000, event: "refunded", created_at: "2026-08-25T10:00:00Z" },
    { id: "p4", order_id: "o4", provider: "cbe", provider_ref: null, amount_etb: 4000, event: "failed", created_at: "2026-08-25T11:00:00Z" },
    { id: "p5", order_id: "o5", provider: "cbe", provider_ref: null, amount_etb: 3000, event: "initiated", created_at: "2026-08-26T11:00:00Z", reviewed_at: null },
  ],
  orders: [], profiles: [],
  deposits: [{ id: "d1", driver_id: "driver-1", amount_etb: 10000, status: "active", created_at: "2026-08-20T00:00:00Z" }],
  commissionCharges: [{ id: "c1", driver_id: "driver-1", order_id: "o1", payment_id: "p1", commission_etb: 2000, status: "active", created_at: "2026-08-26T10:00:00Z" }],
  commissionPayments: [{ id: "cp1", driver_id: "driver-1", amount_etb: 500, status: "approved", submitted_at: "2026-08-26T11:00:00Z" }],
  confirmations: [
    { payment_id: "p1", order_id: "o1", driver_id: "driver-1", commission_etb: 2000, commission_reversed_at: null, commission_accrued_at: "2026-08-26T10:00:00Z" },
    { payment_id: "p6", order_id: "o6", driver_id: "driver-1", commission_etb: 535, commission_reversed_at: null, commission_accrued_at: "2026-08-25T10:00:00Z" },
    { payment_id: "p7", order_id: "o7", driver_id: "driver-1", commission_etb: 900, commission_reversed_at: "2026-08-26T09:00:00Z", commission_accrued_at: "2026-08-25T10:00:00Z" },
  ],
};

test("canonical commission reconciliation deduplicates payment ledgers and excludes reversals", () => {
  assert.equal(canonicalCommissionAccrued(data), 2535);
});

test("finance summary reconciles revenue, escrow, refunds, commission and deposits", () => {
  const summary = computeFinanceSummary(data, now);
  assert.equal(summary.todayRevenue, 100000);
  assert.equal(summary.weeklyRevenue, 100000);
  assert.equal(summary.monthlyRevenue, 100000);
  assert.equal(summary.heldEscrow, 25000);
  assert.equal(summary.pendingReviews, 1);
  assert.equal(summary.refundedPayments, 5000);
  assert.equal(summary.failedPayments, 4000);
  assert.equal(summary.commissionEarned, 2535);
  assert.equal(summary.commissionPaid, 500);
  assert.equal(summary.outstandingCommission, 2035);
  assert.equal(summary.driverDeposits, 10000);
  assert.equal(summary.availableDriverDeposits, 7965);
  assert.equal(summary.netPlatformRevenue, 0);
  assert.equal(summary.activeWallets, 1);
});

test("daily series never creates negative amounts", () => {
  const series = dailySeries(data.payments, 7, now);
  assert.equal(series.length, 7);
  assert.ok(series.every((row) => row.revenue >= 0 && row.escrow >= 0 && row.commission >= 0));
});

test("finance dashboard access follows database leadership roles without opening participant data", () => {
  const existingPolicies = [
    ["payments admin manage", "payments"],
    ["orders admin manage", "orders"],
    ["profiles admin manage", "profiles"],
    ["profiles self or admin read", "profiles"],
    ["driver_commission_deposits_read", "driver_commission_deposits"],
    ["drivers read own commission charges", "driver_commission_charges"],
    ["drivers read own commission payments", "driver_commission_payments"],
  ];

  for (const [policy, table] of existingPolicies) {
    assert.match(
      accessMigration,
      new RegExp(`alter policy "${policy}"\\s+on public\\.${table}[\\s\\S]*?private\\.is_admin_or_ceo\\(\\)`, "i"),
    );
  }

  assert.match(
    accessMigration,
    /create policy "finance dashboard leadership read"\s+on public\.driver_payment_confirmations\s+for select\s+to authenticated\s+using \(\(select private\.is_admin_or_ceo\(\)\)\)/i,
  );
  assert.match(accessMigration, /grant select on table public\.driver_payment_confirmations to authenticated/i);
  assert.match(accessMigration, /revoke all on table public\.driver_payment_confirmations from anon/i);
  assert.doesNotMatch(accessMigration, /grant\s+select[\s\S]*\s+to\s+anon/i);
  assert.doesNotMatch(accessMigration, /auth\.jwt\(\)[\s\S]*app_metadata/i);
});
