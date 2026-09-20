import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260920160000_platform_tax_remittance_ledger.sql"),
  "utf8",
);
const service = readFileSync(path.join(process.cwd(), "src", "services", "platform-tax.service.ts"), "utf8");
const component = readFileSync(path.join(process.cwd(), "src", "components", "admin", "PlatformTaxControl.tsx"), "utf8");
const adminCommission = readFileSync(path.join(process.cwd(), "src", "pages", "AdminDriverCommission.tsx"), "utf8");
const adminNav = readFileSync(path.join(process.cwd(), "src", "components", "admin", "AdminSidebarLeadershipLinks.tsx"), "utf8");
const commission = readFileSync(path.join(process.cwd(), "src", "utils", "commission.ts"), "utf8");
const financeService = readFileSync(path.join(process.cwd(), "src", "services", "admin-finance-v3.service.ts"), "utf8");

test("government tax control uses only the HALLO 2% platform basis and fixed 15% tax rule", () => {
  assert.match(commission, /HALLO_SMART_COMMISSION_RATE = 0\.02/);
  assert.match(commission, /HALLO_SMART_COMMISSION_PERCENT = 2/);
  assert.match(commission, /HALLO_PLATFORM_TAX_RATE = 0\.15/);
  assert.doesNotMatch(commission, /gross \* 0\.15/);
});

test("tax ledger creates immutable period, remittance and audit tables", () => {
  assert.match(migration, /tax_rate_percent numeric\(5,2\) not null default 15\.00[\s\S]*check \(tax_rate_percent = 15\.00\)/i);
  assert.match(migration, /create table public\.platform_tax_periods/i);
  assert.match(migration, /create table public\.platform_tax_remittances/i);
  assert.match(migration, /create table public\.platform_tax_audit/i);
  assert.match(migration, /platform_tax_periods_immutable/i);
  assert.match(migration, /platform_tax_remittances_immutable/i);
  assert.match(migration, /platform_tax_audit_immutable/i);
  assert.match(migration, /reject_platform_tax_history_mutation/i);
  assert.match(migration, /revoke insert, update, delete on table public\.platform_tax_periods from authenticated/i);
  assert.match(migration, /revoke insert, update, delete on table public\.platform_tax_remittances from authenticated/i);
  assert.match(migration, /revoke insert, update, delete on table public\.platform_tax_audit from authenticated/i);
});

test("tax liability uses canonical commission with corrections and unpaid-trip commission", () => {
  assert.match(migration, /private\.platform_commission_for_period/i);
  assert.match(migration, /driver_payment_confirmations/i);
  assert.match(migration, /driver_commission_charges/i);
  assert.match(migration, /financial_corrections/i);
  assert.match(migration, /driver_commission_reversal_etb/i);
  assert.match(migration, /canonical_source/i);
  assert.match(migration, /confirmation\.commission_accrued_at as event_at/i);
  assert.match(migration, /charge\.created_at as event_at/i);
  assert.match(migration, /where not exists \([\s\S]*from public\.driver_payment_confirmations confirmation[\s\S]*confirmation\.payment_id = charge\.payment_id/i);
  assert.match(migration, /timezone\('Africa\/Addis_Ababa', source\.event_at\)::date between p_start and p_end/i);
  assert.match(migration, /driver_trip_payment_results/i);
  assert.match(migration, /result_type = 'payment_not_received'/i);
  assert.match(migration, /positive_result\.result_type in \('cash_received', 'bank_telebirr'\)/i);
  assert.match(migration, /v_due := round\(v_base \* 0\.15, 2\)/i);
});

test("tax period RPC is leadership guarded, non-overlapping and Ethiopia-date aware", () => {
  assert.match(migration, /admin_create_platform_tax_period/i);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /timezone\('Africa\/Addis_Ababa', now\(\)\)::date/i);
  assert.match(migration, /daterange\(period\.period_start, period\.period_end, '\[\]'\)/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('platform_tax_periods'\)\)/i);
  assert.match(migration, /Tax period overlaps an existing recorded period/i);
  assert.match(migration, /Tax period cannot end in the future/i);
  assert.match(migration, /No canonical HALLO commission exists in this period/i);
});

test("remittance RPC rejects invalid amounts, prevents duplicates and blocks overpayment", () => {
  assert.match(migration, /amount_etb numeric\(14,2\) not null check \(amount_etb > 0\)/i);
  assert.match(migration, /if v_amount <= 0 then[\s\S]*Remittance amount must be greater than zero/i);
  assert.match(migration, /request_key uuid not null unique/i);
  assert.match(migration, /admin_record_platform_tax_remittance/i);
  assert.match(migration, /where remittance\.request_key = p_request_key/i);
  assert.ok((migration.match(/where remittance\.request_key = p_request_key/gi) ?? []).length >= 2);
  assert.match(migration, /Payment receipt evidence is required/i);
  assert.match(migration, /concat\(v_period\.id::text, '\/'\)/i);
  assert.match(migration, /Receipt path must belong to the selected tax period/i);
  assert.match(migration, /from storage\.objects object[\s\S]*object\.bucket_id = 'tax-remittance-receipts'[\s\S]*object\.name = v_receipt_path/i);
  assert.match(migration, /Uploaded tax payment evidence was not found/i);
  assert.match(migration, /Remittance exceeds the current outstanding tax balance/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /platform_tax_remittances_reference_unique/i);
  assert.match(migration, /on public\.platform_tax_remittances \(lower\(btrim\(reference\)\)\)/i);
  assert.match(migration, /receipt_path text not null unique/i);
});

test("tax control exposes all-time and unperiodized liability so no commission is hidden before period creation", () => {
  assert.match(migration, /allTimeCommissionEtb/);
  assert.match(migration, /allTimeTaxReserveEtb/);
  assert.match(migration, /periodizedTaxDueEtb/);
  assert.match(migration, /unperiodizedTaxEtb/);
  assert.match(migration, /date '1970-01-01'/);
  assert.match(component, /All-time tax reserve/);
  assert.match(component, /Unperiodized liability/);
});

test("tax status covers due, partial and fully paid remittance states", () => {
  assert.match(migration, /admin_platform_tax_control/i);
  assert.match(migration, /when period\.paid_etb >= period\.current_tax_due_etb then 'paid'/i);
  assert.match(migration, /when period\.paid_etb > 0 then 'partial'/i);
  assert.match(migration, /else 'due'/i);
  assert.match(migration, /greatest\(period\.current_tax_due_etb - period\.paid_etb, 0\)/i);
  assert.doesNotMatch(migration, /status\s+text\s+not null[\s\S]{0,80}platform_tax_periods/i);
});

test("all tax RPCs and tax-table reads deny non-leadership users", () => {
  for (const fn of [
    "admin_create_platform_tax_period",
    "admin_record_platform_tax_remittance",
    "admin_platform_tax_control",
  ]) {
    const start = migration.indexOf(`create or replace function public.${fn}`);
    assert.ok(start >= 0, `missing ${fn}`);
    const next = migration.indexOf("create or replace function public.", start + 1);
    const body = migration.slice(start, next >= 0 ? next : migration.length);
    assert.match(body, /private\.is_admin_or_ceo\(\)/i);
    assert.match(body, /Admin or CEO access required/i);
    assert.match(body, /revoke all on function public\./i);
    assert.match(body, /grant execute on function public\./i);
  }
  assert.match(migration, /platform_tax_periods_leadership_read[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /platform_tax_remittances_leadership_read[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /platform_tax_audit_leadership_read[\s\S]*private\.is_admin_or_ceo\(\)/i);
});

test("Admin tax control refreshes from the authoritative RPC after mutations", () => {
  assert.match(component, /const next = await getPlatformTaxControl\(\)/);
  assert.match(component, /useEffect\(\(\) => \{ void load\(\); \}, \[\]\)/);
  assert.match(component, /await createPlatformTaxPeriod[\s\S]*await load\(\)/);
  assert.match(component, /await recordPlatformTaxRemittance[\s\S]*await load\(\)/);
  assert.match(service, /supabase\.rpc\("admin_platform_tax_control"\)/);
});

test("tax migration does not mutate existing payment, commission or payout history", () => {
  assert.doesNotMatch(migration, /update\s+public\.(payments|driver_commission_charges|driver_payment_confirmations|driver_trip_payment_results)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(payments|driver_commission_charges|driver_payment_confirmations|driver_trip_payment_results)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(payments|driver_commission_charges|driver_payment_confirmations|driver_trip_payment_results)/i);
  assert.match(financeService, /splitHalloPlatformTax\(driverCommissionEarned\)/);
  assert.match(financeService, /netPlatformRevenueAfterTax: Math\.max\(0, netPlatformRevenue - platformTaxReserve\)/);
});

test("tax evidence bucket is private append-only for database-backed leadership", () => {
  assert.match(migration, /'tax-remittance-receipts'/);
  assert.match(migration, /false,\s*10485760/i);
  assert.match(migration, /tax remittance receipt upload[\s\S]*for insert to authenticated[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /tax remittance receipt read[\s\S]*for select to authenticated[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.doesNotMatch(migration, /create policy "tax remittance[^"]*"[^;]*for update/is);
  assert.doesNotMatch(migration, /create policy "tax remittance[^"]*"[^;]*for delete/is);
});

test("tax report returns immutable actor-attributed audit events", () => {
  assert.match(migration, /'audit', \(/);
  assert.match(migration, /'eventType', audit\.event_type/);
  assert.match(migration, /'actorName', profile\.full_name/);
  assert.match(service, /PlatformTaxAuditEvent/);
  assert.match(service, /audit: Array\.isArray\(raw\.audit\)/);
  assert.match(component, /Immutable audit trail/);
  assert.match(component, /period creation and remittance events are append-only/i);
});

test("Admin service uploads evidence without overwrite and uses secure tax RPCs", () => {
  assert.match(service, /BUCKET = "tax-remittance-receipts"/);
  assert.match(service, /MAX_FILE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(service, /image\/jpeg/);
  assert.match(service, /application\/pdf/);
  assert.match(service, /admin_platform_tax_control/);
  assert.match(service, /admin_create_platform_tax_period/);
  assert.match(service, /admin_record_platform_tax_remittance/);
  assert.match(service, /upsert: false/);
  assert.match(service, /createSignedUrl\(path, 300\)/);
});

test("Admin tax UI exposes period creation, immutable remittance entry and evidence review", () => {
  assert.match(adminCommission, /<PlatformTaxControl \/>/);
  assert.match(adminNav, /Commission &amp; tax control/);
  assert.match(component, /Tax liability & remittance ledger/);
  assert.match(component, /name="periodStart"/);
  assert.match(component, /name="periodEnd"/);
  assert.match(component, /name="amountEtb"/);
  assert.match(component, /name="paymentDate"/);
  assert.match(component, /name="reference"/);
  assert.match(component, /name="evidence"/);
  assert.match(component, /Record immutable remittance/);
  assert.match(component, /Open evidence/);
  assert.match(component, /due → partial → paid/);
  assert.doesNotMatch(component, />Delete remittance<|>Edit remittance</i);
});
