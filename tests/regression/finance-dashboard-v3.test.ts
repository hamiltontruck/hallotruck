import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canAccessAdminWorkspace, isDatabaseLeadershipRole } from "../../src/domain/partner-onboarding";
import { canonicalCommissionAccrued, computeFinanceSummary, dailySeries, rangeStart, type FinanceDashboardData } from "../../src/domain/finance-dashboard";

const accessMigration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260826221314_fix_finance_dashboard_access.sql"),
  "utf8",
);
const hardenedAccessMigration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260829170000_harden_finance_dashboard_v3_access.sql"),
  "utf8",
);
const adminGate = readFileSync(path.join(process.cwd(), "src", "components", "auth", "AdminGate.tsx"), "utf8");
const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
const dashboard = readFileSync(path.join(process.cwd(), "src", "pages", "AdminFinanceDashboardV3.tsx"), "utf8");

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
  corrections: [],
};

test("canonical commission reconciliation deduplicates payment ledgers and excludes reversals", () => {
  assert.equal(canonicalCommissionAccrued(data), 2535);
});

test("immutable partial refunds reduce canonical commission without double counting", () => {
  assert.equal(canonicalCommissionAccrued({
    ...data,
    corrections: [
      { id: "fc1", source_payment_id: "p1", driver_commission_reversal_etb: 20, amount_etb: 1000, correction_type: "partial_refund", created_at: now.toISOString() },
      { id: "fc2", source_payment_id: "p1", driver_commission_reversal_etb: 30, amount_etb: 1500, correction_type: "partial_refund", created_at: now.toISOString() },
    ],
  }), 2485);
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

test("finance date filters use exact local-day boundaries", () => {
  const localNoon = new Date(2026, 7, 26, 12, 30, 0, 0);
  assert.deepEqual(
    [rangeStart("today", localNoon)?.getHours(), rangeStart("today", localNoon)?.getMinutes()],
    [0, 0],
  );
  assert.deepEqual(
    [rangeStart("7d", localNoon)?.getDate(), rangeStart("7d", localNoon)?.getHours(), rangeStart("7d", localNoon)?.getMinutes()],
    [20, 0, 0],
  );
  assert.deepEqual(
    [rangeStart("30d", localNoon)?.getHours(), rangeStart("90d", localNoon)?.getHours()],
    [0, 0],
  );
});

test("finance dashboard role decisions allow Admin and CEO only", () => {
  assert.equal(isDatabaseLeadershipRole("admin"), true);
  assert.equal(isDatabaseLeadershipRole("ceo"), true);
  assert.equal(canAccessAdminWorkspace("admin", "active"), true);
  assert.equal(canAccessAdminWorkspace("ceo", null), true);
  assert.equal(canAccessAdminWorkspace("customer", "active"), false);
  assert.equal(canAccessAdminWorkspace("driver", "approved"), false);
  assert.equal(canAccessAdminWorkspace("partner", "active"), false);
  assert.equal(canAccessAdminWorkspace(null, null), false);
  assert.equal(canAccessAdminWorkspace("admin", "suspended"), false);
});

test("Finance route remains behind AdminGate for refresh and direct navigation", () => {
  assert.match(app, /path="\/admin\/finance" element={<AdminGate><AdminToolShell><AdminFinanceDashboardV3 \/><\/AdminToolShell><\/AdminGate>}/);
});

test("AdminGate uses database profile role/status and handles failed lookup securely", () => {
  assert.match(adminGate, /supabase\.auth\.getSession\(\)/i);
  assert.match(adminGate, /onAuthStateChange/i);
  assert.match(adminGate, /from\("profiles"\)[\s\S]*select\("role,driver_status"\)/i);
  assert.match(adminGate, /canAccessAdminWorkspace\(role, profile\?\.driver_status\)/i);
  assert.match(adminGate, /This account does not have CEO or Admin access/i);
  assert.match(adminGate, /profileError \|\| !canAccessAdminWorkspace/i);
  assert.doesNotMatch(adminGate, /app_metadata|user_metadata|localStorage|routeParams|email\.endsWith/i);
});

test("Finance source failures show source-specific error and retry without false zero KPIs", () => {
  for (const source of ["payments", "orders", "profiles", "deposits", "commission charges", "commission payments", "driver confirmations", "financial corrections"]) {
    assert.match(dashboard, new RegExp(`name: "${source}"`, "i"));
  }
  assert.match(dashboard, /source failed:/i);
  assert.match(dashboard, /Retry finance data/i);
  assert.match(dashboard, /No KPI values are shown because one or more finance sources failed/i);
  assert.match(dashboard, /error \?[\s\S]*loading \?[\s\S]*<section className="mt-5 grid grid-cols-2 gap-3/i);
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

test("Finance dashboard database helper denies suspended users and avoids metadata trust", () => {
  assert.match(hardenedAccessMigration, /create or replace function private\.is_admin_or_ceo\(\)/i);
  assert.match(hardenedAccessMigration, /from public\.profiles profile[\s\S]*profile\.role::text in \('admin', 'ceo'\)/i);
  assert.match(hardenedAccessMigration, /coalesce\(profile\.driver_status::text, 'active'\) <> 'suspended'/i);
  assert.match(hardenedAccessMigration, /revoke all on function private\.is_admin_or_ceo\(\) from public, anon/i);
  assert.match(hardenedAccessMigration, /grant execute on function private\.is_admin_or_ceo\(\) to authenticated/i);
  assert.doesNotMatch(hardenedAccessMigration, /app_metadata|user_metadata|raw_user_meta_data|email/i);
});
