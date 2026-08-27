import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildPartnerStatement,
  filterPartnerStatement,
  getPartnerSettlementProgress,
  type SettlementCorrectionLike,
  type SettlementLike,
  type SettlementPaymentLike,
} from "../../src/domain/partner-settlement";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase", "migrations", "20260827164956_partner_settlement_enterprise_workflow.sql"), "utf8");
const service = readFileSync(path.join(root, "src", "services", "partner-finance.service.ts"), "utf8");
const adminWorkflow = readFileSync(path.join(root, "src", "components", "partner", "AdminPartnerSettlementWorkflow.tsx"), "utf8");
const statement = readFileSync(path.join(root, "src", "components", "partner", "PartnerStatement.tsx"), "utf8");
const exports = readFileSync(path.join(root, "src", "utils", "partner-statement-export.ts"), "utf8");
const partnerWallet = readFileSync(path.join(root, "src", "pages", "PartnerWallet.tsx"), "utf8");

const settlement: SettlementLike = {
  id: "settlement-1",
  partner_id: "partner-1",
  project_id: "project-1",
  settlement_reference: "HPS-2026-000001",
  amount_etb: 1000,
  status: "partially_paid",
  created_at: "2026-08-01T00:00:00.000Z",
  paid_at: null,
};
const payments: SettlementPaymentLike[] = [{
  id: "payment-1",
  settlement_id: settlement.id,
  partner_id: settlement.partner_id,
  amount_etb: 400,
  payment_method: "bank_transfer",
  provider: "CBE",
  transaction_ref: "CBE-001",
  paid_at: "2026-08-02T00:00:00.000Z",
}];

test("settlement lifecycle supports review, approval, partial payment, rejection and derived reversal", () => {
  for (const status of ["pending", "under_review", "approved", "partially_paid", "paid", "rejected", "reversed"]) {
    assert.ok(migration.includes(`'${status}'`), `missing status ${status}`);
  }
  assert.match(migration, /Only pending settlements can enter review/);
  assert.match(migration, /Only settlements under review can be approved/);
  assert.match(migration, /Only pending or under-review settlements can be rejected/);
  assert.match(migration, /Only approved or partially paid settlements can receive payment/);
  assert.match(adminWorkflow, /Start review/);
  assert.match(adminWorkflow, /Required approval notes/);
  assert.match(adminWorkflow, /Required rejection reason/);
});

test("partial payments are immutable, idempotent and duplicate-transaction safe", () => {
  assert.match(migration, /create table public\.partner_settlement_payments/i);
  assert.match(migration, /request_key uuid not null unique/i);
  assert.match(migration, /partner_settlement_payments_transaction_key[\s\S]*lower\(payment_method\)[\s\S]*lower\(btrim\(transaction_ref\)\)/i);
  assert.match(migration, /Settlement payment exceeds outstanding amount/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /partner_settlement_payments_immutable[\s\S]*reject_financial_history_mutation/i);
  assert.match(service, /admin_record_partner_settlement_payment/);
  assert.match(service, /p_request_key: crypto\.randomUUID\(\)/);
});

test("settlement tables expose read-only tenant data and leadership writes only through RPCs", () => {
  assert.match(migration, /alter table public\.partner_settlement_payments enable row level security/i);
  assert.match(migration, /alter table public\.partner_settlement_events enable row level security/i);
  assert.match(migration, /partner_settlement_payments_authorized_read[\s\S]*can_view_partner_finance\(partner_id\)/i);
  assert.match(migration, /partner_settlement_events_authorized_read[\s\S]*can_view_partner_finance\(partner_id\)/i);
  assert.match(migration, /revoke all on table public\.partner_settlements from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.partner_settlements to authenticated/i);
  for (const rpc of [
    "admin_create_partner_settlement_request",
    "admin_transition_partner_settlement",
    "admin_record_partner_settlement_payment",
    "admin_reverse_partner_settlement",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?private\\.is_admin_or_ceo\\(\\)`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon`, "i"));
  }
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/i);
});

test("structured audit rows preserve settlement and earning financial history", () => {
  assert.match(migration, /create table public\.partner_settlement_events/i);
  assert.match(migration, /partner_settlement_events_immutable[\s\S]*reject_financial_history_mutation/i);
  assert.match(migration, /settlement_reference text/);
  assert.match(migration, /approval_notes text/);
  assert.match(migration, /rejection_reason text/);
  assert.match(migration, /partner_settlement_reversed/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(partner_freight_earnings|partner_settlements|partner_settlement_payments)/i);
  assert.doesNotMatch(migration, /update\s+public\.partner_freight_earnings/i);
});

test("wallet reservations and payments use correction-aware settlement totals", () => {
  assert.match(migration, /row\.status in \('pending', 'under_review', 'approved', 'partially_paid'\)/i);
  assert.match(migration, /partner_settlement_payments payment[\s\S]*payment\.settlement_id = settlement\.id/i);
  assert.match(migration, /financial_corrections correction[\s\S]*correction\.partner_settlement_id = settlement\.id/i);
  assert.match(migration, /earning_totals\.net - settlement_totals\.paid - settlement_totals\.pending/i);

  assert.deepEqual(getPartnerSettlementProgress(settlement, payments, []), {
    status: "partially_paid",
    recordedPaidEtb: 400,
    effectivePaidEtb: 400,
    outstandingEtb: 600,
    reversedEtb: 0,
  });
});

test("paid settlement reversal restores the statement without changing original payment rows", () => {
  assert.match(migration, /v_existing_correction_id uuid;/);
  assert.match(migration, /if found then return v_existing_correction_id; end if;[\s\S]*v_correction_id := gen_random_uuid\(\);/i);
  const paidSettlement: SettlementLike = { ...settlement, status: "paid", paid_at: "2026-08-02T00:00:00.000Z" };
  const fullPayment: SettlementPaymentLike[] = [{ ...payments[0], amount_etb: 1000 }];
  const corrections: SettlementCorrectionLike[] = [{
    id: "correction-1",
    partner_settlement_id: settlement.id,
    partner_earning_id: null,
    amount_etb: 1000,
    partner_net_reversal_etb: 0,
    reason: "Verified bank transfer was reversed",
    created_at: "2026-08-03T00:00:00.000Z",
  }];
  const progress = getPartnerSettlementProgress(paidSettlement, fullPayment, corrections);
  assert.equal(progress.status, "reversed");
  assert.equal(progress.effectivePaidEtb, 0);
  assert.equal(progress.outstandingEtb, 0);

  const rows = buildPartnerStatement([], [paidSettlement], fullPayment, corrections);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].debitEtb, 1000);
  assert.equal(rows[1].creditEtb, 1000);
  assert.equal(rows[1].balanceEtb, 0);
});

test("statement supports date, project, freight and settlement filters plus safe exports", () => {
  const rows = buildPartnerStatement([
    { id:"earning-1", order_id:"ORDER-ABC", project_id:"project-1", partner_net_etb:750, accrued_at:"2026-08-01T00:00:00.000Z" },
  ], [settlement], payments, []);
  const freightOnly = filterPartnerStatement(rows, {
    from:"2026-08-01", to:"2026-08-01", projectId:"project-1",
    entryType:"all", freight:"order-abc", settlementStatus:"all",
  });
  assert.equal(freightOnly.length, 1);
  assert.equal(freightOnly[0].entryType, "freight");
  const partialOnly = filterPartnerStatement(rows, {
    from:"", to:"", projectId:"project-1", entryType:"all", freight:"",
    settlementStatus:"partially_paid",
  });
  assert.equal(partialOnly.length, 1);
  assert.equal(partialOnly[0].entryType, "settlement");

  assert.match(statement, /From date/);
  assert.match(statement, /Freight reference/);
  assert.match(statement, /Settlement status/);
  assert.match(statement, /CSV/);
  assert.match(statement, /Excel/);
  assert.match(statement, /Print \/ PDF/);
  assert.match(exports, /text\/csv/);
  assert.match(exports, /application\/vnd\.ms-excel/);
  assert.match(exports, /\^\[=\+\\-@\]/);
});

test("Partner portal displays effective status, partial progress and audit history", () => {
  assert.match(partnerWallet, /getPartnerSettlementProgress/);
  assert.match(partnerWallet, /Outstanding/);
  assert.match(partnerWallet, /settlementEvents/);
  assert.match(partnerWallet, /PartnerStatement/);
});

test("freight accrual subtracts refunds recorded before an earning is created", () => {
  assert.match(migration, /when payment\.event = 'released' then payment\.amount_etb/i);
  assert.match(migration, /when payment\.event = 'refunded' then -payment\.amount_etb/i);
  assert.match(migration, /Order has no effective released payment/i);
  assert.match(migration, /project_id, order_id, vehicle_id/i);
});
