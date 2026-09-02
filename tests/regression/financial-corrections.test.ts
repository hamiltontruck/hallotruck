import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase", "migrations", "20260827101439_immutable_financial_corrections.sql"), "utf8");
const restorationMigration = readFileSync(path.join(root, "supabase", "migrations", "20260902065000_legacy_over_refund_restoration.sql"), "utf8");
const releaseGuard = readFileSync(path.join(root, "supabase", "migrations", "20260827102244_count_all_refunds_in_release_guard.sql"), "utf8");
const adminService = readFileSync(path.join(root, "src", "services", "admin.service.ts"), "utf8");
const correctionService = readFileSync(path.join(root, "src", "services", "financial-correction.service.ts"), "utf8");
const adminFinance = readFileSync(path.join(root, "src", "pages", "SmartLogistics.tsx"), "utf8");
const correctionForm = readFileSync(path.join(root, "src", "components", "admin", "PaymentCorrectionForm.tsx"), "utf8");
const restorationForm = readFileSync(path.join(root, "src", "components", "admin", "LegacyRefundRestorationForm.tsx"), "utf8");
const paymentCollection = readFileSync(path.join(root, "src", "components", "admin", "AdminPaymentCollectionControl.tsx"), "utf8");
const paymentSummary = readFileSync(path.join(root, "src", "utils", "paymentSummary.ts"), "utf8");
const partnerFinance = readFileSync(path.join(root, "src", "services", "partner-finance.service.ts"), "utf8");
const partnerWallet = readFileSync(path.join(root, "src", "pages", "PartnerWallet.tsx"), "utf8");
const driverEarnings = readFileSync(path.join(root, "src", "services", "driver-earnings.service.ts"), "utf8");
const driverCompliance = readFileSync(path.join(root, "src", "pages", "AdminDriverCompliance.tsx"), "utf8");
const financeDashboard = readFileSync(path.join(root, "src", "pages", "AdminFinanceDashboardV3.tsx"), "utf8");

test("financial corrections preserve source rows and require immutable audit identity", () => {
  assert.match(migration, /create table public\.financial_corrections/i);
  assert.match(migration, /request_key uuid not null unique/i);
  assert.match(migration, /source_payment_id uuid references public\.payments\(id\) on delete restrict/i);
  assert.match(migration, /refund_payment_id uuid unique references public\.payments\(id\) on delete restrict/i);
  assert.match(migration, /reason text not null check \(char_length\(btrim\(reason\)\) between 5 and 500\)/i);
  assert.match(migration, /actor_id uuid not null references public\.profiles\(id\) on delete restrict/i);
  assert.match(migration, /financial_corrections_immutable[\s\S]*before update or delete/i);
  assert.match(migration, /partner_freight_earnings_immutable[\s\S]*before update or delete/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(payments|driver_payment_confirmations|driver_commission_charges|partner_freight_earnings|partner_settlements)/i);
});

test("full and partial refunds allocate commission exactly and prevent over-reversal", () => {
  assert.match(migration, /v_type = 'partial_refund' and v_amount >= v_remaining/i);
  assert.match(migration, /v_type <> 'partial_refund' and v_amount <> v_remaining/i);
  assert.match(migration, /v_amount > v_remaining[\s\S]*Correction exceeds remaining payment amount/i);
  assert.match(migration, /when v_amount = v_remaining then greatest\(v_original_driver_commission - v_prior_driver_reversal, 0\)/i);
  assert.match(migration, /round\(v_original_driver_commission \* v_amount \/ v_source_amount, 2\)/i);
  assert.match(migration, /driver_commission_charged_total[\s\S]*financial_corrections[\s\S]*driver_commission_reversal_etb/i);
  assert.match(migration, /greatest\(0, reconciled\.deposited - reconciled\.unpaid_commission\)/i);
  assert.match(migration, /greatest\(0, reconciled\.unpaid_commission - reconciled\.deposited\)/i);
});

test("duplicates, invalid payments and cancelled orders use guarded correction types", () => {
  for (const correctionType of ["full_refund", "partial_refund", "duplicate", "invalidated", "cancelled_order"]) {
    assert.ok(migration.includes(`'${correctionType}'`), `missing ${correctionType}`);
  }
  assert.match(migration, /cancelled_order' and v_order_status <> 'cancelled'[\s\S]*requires a cancelled order/i);
  assert.match(migration, /where correction\.request_key = p_request_key[\s\S]*already processed/i);
  assert.match(migration, /Payment has already been fully corrected/i);
  assert.match(migration, /provider_ref[\s\S]*CORR-[\s\S]*p_request_key/i);
});

test("paid Partner settlements reverse once without mutating the settlement row", () => {
  assert.match(migration, /create or replace function public\.admin_reverse_partner_settlement/i);
  assert.match(migration, /if v_status <> 'paid' then raise exception 'Only paid Partner settlements can be reversed'/i);
  assert.match(migration, /partner_settlement_id uuid unique/i);
  assert.match(migration, /Partner settlement was already reversed/i);
  assert.match(migration, /partner_settlement_reversed/i);
  assert.match(migration, /settlement\.amount_etb - coalesce\(sum\(correction\.amount_etb\), 0\)/i);
  assert.doesNotMatch(migration, /update\s+public\.partner_settlements\s+set\s+status\s*=\s*'reversed'/i);
  assert.match(partnerFinance, /reversePaidPartnerSettlement/);
  assert.match(partnerWallet, /original settlement preserved/);
});

test("correction actions are database-role authorized and tenant isolated", () => {
  assert.match(migration, /if v_actor is null or not \(select private\.is_admin_or_ceo\(\)\)/i);
  assert.match(migration, /create policy financial_corrections_authorized_read[\s\S]*driver_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /membership\.user_id = \(select auth\.uid\(\)\)[\s\S]*member_role in \('owner', 'admin'\)/i);
  assert.match(migration, /revoke all on table public\.financial_corrections from anon/i);
  assert.match(migration, /revoke insert, update, delete on table public\.financial_corrections from authenticated/i);
  assert.match(migration, /revoke all on function public\.admin_reverse_payment[\s\S]*from public, anon/i);
  assert.match(migration, /revoke all on function public\.admin_reverse_partner_settlement[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/i);
});

test("legacy unaudited refunds and broken payment-event options are unavailable", () => {
  assert.match(migration, /revoke all on function public\.admin_refund_order_credit\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(adminService, /admin_refund_order_credit|refundOverpaymentCredit/);
  assert.doesNotMatch(adminService, /event:"initiated"\|"held_escrow"\|"released"\|"refunded"/);
  assert.doesNotMatch(adminFinance, /\["refunded","Refunded"\]|\["failed","Failed"\]/);
  assert.match(adminFinance, /PaymentCorrectionForm/);
  assert.match(correctionForm, /Confirm immutable correction/);
  assert.match(correctionForm, /minLength=\{5\}/);
  assert.match(correctionService, /admin_reverse_payment/);
  assert.match(correctionService, /p_reason: input\.reason\.trim\(\)/);
});

test("all refund events recalculate driver earnings and Finance commission", () => {
  assert.match(driverEarnings, /filter\(\(payment\) => payment\.event === "refunded"\)/);
  assert.doesNotMatch(driverEarnings, /payment\.provider === "credit_refund"/);
  assert.doesNotMatch(driverCompliance, /payment\.provider === "credit_refund"/);
  assert.match(financeDashboard, /from\("financial_corrections"\)/);
  assert.match(financeDashboard, /table: "financial_corrections"/);
  assert.match(migration, /create or replace function public\.admin_platform_commission_accruals/i);
  assert.match(migration, /'partially_reversed'/i);
  assert.match(releaseGuard, /filter \(where payment\.event = 'refunded'\)/i);
  assert.doesNotMatch(releaseGuard, /provider\s*=\s*'credit_refund'/i);
  assert.match(releaseGuard, /revoke all on function public\.release_confirmed_driver_payment_internal\(uuid\)[\s\S]*from public, anon, authenticated/i);
});

test("legacy excess-refund restoration is append-only, evidence-backed and idempotent", () => {
  assert.match(restorationMigration, /'legacy_refund_restoration'/i);
  assert.match(restorationMigration, /external_evidence_reference/i);
  assert.match(restorationMigration, /create or replace function public\.admin_restore_legacy_excess_refund/i);
  assert.match(restorationMigration, /not \(select private\.is_admin_or_ceo\(\)\)/i);
  assert.match(restorationMigration, /Restoration request was already processed/i);
  assert.match(restorationMigration, /Only a refunded payment can be restored/i);
  assert.match(restorationMigration, /financial-correction refunds cannot be restored with the legacy workflow/i);
  assert.match(restorationMigration, /Restoration exceeds the current ledger anomaly/i);
  assert.match(restorationMigration, /Restoration exceeds the remaining legacy refund amount/i);
  assert.match(restorationMigration, /driver_commission_reversal_etb[\s\S]*0, 0, 0, 0/i);
  assert.match(restorationMigration, /revoke all on function public\.admin_restore_legacy_excess_refund[\s\S]*from public, anon/i);
  assert.match(restorationMigration, /grant execute on function public\.admin_restore_legacy_excess_refund[\s\S]*to authenticated/i);
  assert.doesNotMatch(restorationMigration, /update\s+public\.payments/i);
  assert.doesNotMatch(restorationMigration, /delete\s+from\s+public\.payments/i);
  assert.doesNotMatch(restorationMigration, /insert\s+into\s+public\.payments/i);
});

test("central balance guard prevents legacy anomalies from creating artificial collection capacity", () => {
  assert.match(restorationMigration, /create or replace function private\.enforce_effective_payment_balance/i);
  assert.match(restorationMigration, /v_initiated \+ greatest\(0, v_effective_verified\)/i);
  assert.match(restorationMigration, /Refund exceeds effective verified funds/i);
  assert.match(restorationMigration, /Refunds must be appended through the auditable financial correction workflow/i);
  assert.match(restorationMigration, /create trigger payments_effective_balance_guard[\s\S]*before insert or update of event, amount_etb, order_id/i);
  assert.match(restorationMigration, /legacy_refund_restoration_total[\s\S]*order_payment_financial_summary/i);
  assert.match(restorationMigration, /legacy_refund_restoration_total[\s\S]*admin_payment_integrity_report/i);
  assert.match(restorationMigration, /legacy_refund_restoration_total[\s\S]*order_payment_ready_for_dispatch/i);
});

test("Finance UI labels ledger anomalies and never treats restoration as new commissionable money", () => {
  assert.match(paymentSummary, /legacyRefundRestored/i);
  assert.match(paymentSummary, /releasedGross \+ heldEscrow - refunded \+ legacyRefundRestored/i);
  assert.match(paymentCollection, /Ledger anomaly/i);
  assert.match(paymentCollection, /Ordinary collection actions are paused/i);
  assert.match(paymentCollection, /LegacyRefundRestorationForm/i);
  assert.match(restorationForm, /external evidence proves/i);
  assert.match(restorationForm, /never edits or deletes the original payment row/i);
  assert.match(correctionService, /admin_restore_legacy_excess_refund/i);
  assert.match(correctionService, /p_external_evidence_reference/i);
});
