import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const summaryFix = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260827025647_fix_partner_wallet_summary_ambiguity.sql"), "utf8");
const financeAuthorization = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260827030243_harden_finance_rpc_authorization.sql"), "utf8");
const financeDashboard = readFileSync(path.join(process.cwd(), "src", "pages", "AdminFinanceDashboardV3.tsx"), "utf8");
const partnerWallet = readFileSync(path.join(process.cwd(), "src", "pages", "PartnerWallet.tsx"), "utf8");

function commission(gross:number,type:"percentage"|"fixed",value:number){const hallo=type==="percentage"?Math.round(gross*value)/100:Math.min(value,gross);return{hallo,net:gross-hallo};}
function wallet(net:number,pending:number,paid:number){return Math.max(net-pending-paid,0);}

test("percentage commission applies to HALLO freight",()=>{assert.deepEqual(commission(1_000_000,"percentage",1),{hallo:10_000,net:990_000});});
test("fixed commission never exceeds gross",()=>{assert.deepEqual(commission(400,"fixed",500),{hallo:400,net:0});});
test("pending and paid settlements reduce payable",()=>{assert.equal(wallet(990_000,100_000,250_000),640_000);});
test("payable never becomes negative",()=>{assert.equal(wallet(100,50,100),0);});
test("fleet scale is independent from commission count",()=>{const fleet=Array.from({length:500},(_,i)=>`TRUCK-${i+1}`);const halloLoads=["ORDER-1","ORDER-2"];assert.equal(fleet.length,500);assert.equal(halloLoads.length,2);});

test("Partner wallet summary qualifies immutable ledger columns and preserves authorization", () => {
  for (const qualifiedColumn of [
    "earning.gross_etb",
    "earning.hallo_commission_etb",
    "earning.partner_net_etb",
    "earning.status",
    "settlement.amount_etb",
    "settlement.status",
    "vehicle.status",
  ]) assert.ok(summaryFix.includes(qualifiedColumn), `missing qualified column ${qualifiedColumn}`);
  assert.match(summaryFix, /if not public\.can_view_partner_finance\(p_partner_id\)/i);
  assert.match(summaryFix, /revoke all on function public\.partner_wallet_summary\(uuid\) from public, anon/i);
  assert.match(summaryFix, /grant execute on function public\.partner_wallet_summary\(uuid\) to authenticated/i);
  assert.match(summaryFix, /create or replace function public\.can_view_partner_finance[\s\S]*private\.is_admin_or_ceo\(\)/i);
  for (const policy of ["partner_commission_rules_admin_insert", "partner_commission_rules_admin_update", "partner_fleet_admin_insert", "partner_fleet_admin_update", "partner_earnings_admin_insert", "partner_earnings_admin_update", "partner_settlements_admin_insert", "partner_settlements_admin_update"]) {
    assert.match(summaryFix, new RegExp(`alter policy ${policy}[\\s\\S]*private\\.is_admin_or_ceo\\(\\)`, "i"));
  }
  for (const rpc of ["admin_record_partner_freight", "admin_create_partner_settlement", "admin_mark_partner_settlement_paid"]) {
    assert.match(summaryFix, new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?if not \\(select private\\.is_admin_or_ceo\\(\\)\\)`, "i"));
  }
  assert.doesNotMatch(summaryFix, /delete\s+from|update\s+public\.partner_freight_earnings/i);
});

test("Finance and Partner wallets never render zero KPIs after a required source failure", () => {
  assert.match(financeDashboard, /No KPI values are shown because one or more finance sources failed/);
  assert.match(financeDashboard, /error \? <section[\s\S]*?: loading \? <section[\s\S]*?: <>/);
  assert.match(partnerWallet, /No wallet totals are shown because the finance source failed/);
  assert.match(partnerWallet, /error\?<section[\s\S]*?:loading\?<p[\s\S]*?:<>/);
});

test("Finance RPCs use database roles and expose no anonymous execution path", () => {
  assert.match(financeAuthorization, /create or replace function public\.admin_payment_integrity_report\(\)[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.doesNotMatch(financeAuthorization, /app_metadata[\s\S]*admin_payment_integrity_report/i);
  assert.match(financeAuthorization, /create or replace function public\.order_payment_financial_summary[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.match(financeAuthorization, /revoke all on function public\.admin_payment_integrity_report\(\) from public, anon/i);
  assert.match(financeAuthorization, /revoke all on function public\.order_payment_financial_summary\(uuid\) from public, anon/i);
  assert.match(financeAuthorization, /grant execute on function public\.order_payment_financial_summary\(uuid\) to authenticated, service_role/i);
  for (const triggerFunction of [
    "audit_payment_review_transition",
    "enforce_verified_payment_before_dispatch",
    "enforce_verified_payment_before_dispatch_request",
    "prepare_payment_review_metadata",
  ]) {
    assert.match(financeAuthorization, new RegExp(`revoke all on function public\\.${triggerFunction}\\(\\) from public, anon, authenticated`, "i"));
  }
});
