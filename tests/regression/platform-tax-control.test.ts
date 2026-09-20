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
const commission = readFileSync(path.join(process.cwd(), "src", "utils", "commission.ts"), "utf8");

test("HALLO 2% Driver commission and Driver 98% split remain unchanged", () => {
  assert.match(commission, /HALLO_SMART_COMMISSION_RATE = 0\.02/);
  assert.match(commission, /HALLO_SMART_COMMISSION_PERCENT = 2/);
  assert.match(commission, /driverNetEtb = roundMoney\(Math\.max\(0, gross - commissionEtb\)\)/);
  assert.match(commission, /HALLO_PLATFORM_TAX_RATE = 0\.15/);
  assert.doesNotMatch(commission, /gross \* 0\.15/);
});

test("tax ledger creates immutable period, remittance and audit tables", () => {
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

test("remittance RPC is idempotent, evidence-required and blocks overpayment", () => {
  assert.match(migration, /request_key uuid not null unique/i);
  assert.match(migration, /admin_record_platform_tax_remittance/i);
  assert.match(migration, /where remittance\.request_key = p_request_key/i);
  assert.match(migration, /Payment receipt evidence is required/i);
  assert.match(migration, /concat\(v_period\.id::text, '\/'\)/i);
  assert.match(migration, /Receipt path must belong to the selected tax period/i);
  assert.match(migration, /Remittance exceeds the current outstanding tax balance/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /reference_unique/i);
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

test("tax status is derived from immutable remittances instead of manually editable state", () => {
  assert.match(migration, /admin_platform_tax_control/i);
  assert.match(migration, /when period\.paid_etb >= period\.current_tax_due_etb then 'paid'/i);
  assert.match(migration, /when period\.paid_etb > 0 then 'partial'/i);
  assert.match(migration, /else 'due'/i);
  assert.match(migration, /greatest\(period\.current_tax_due_etb - period\.paid_etb, 0\)/i);
  assert.doesNotMatch(migration, /status\s+text\s+not null[\s\S]{0,80}platform_tax_periods/i);
});

test("tax evidence bucket is private append-only for database-backed leadership", () => {
  assert.match(migration, /'tax-remittance-receipts'/);
  assert.match(migration, /false,\s*10485760/i);
  assert.match(migration, /tax remittance receipt upload[\s\S]*for insert to authenticated[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /tax remittance receipt read[\s\S]*for select to authenticated[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.doesNotMatch(migration, /create policy "tax remittance[^"]*"[^;]*for update/is);
  assert.doesNotMatch(migration, /create policy "tax remittance[^"]*"[^;]*for delete/is);
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
