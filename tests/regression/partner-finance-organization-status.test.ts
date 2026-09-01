import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildPartnerSettlementControlSummary } from "../../src/domain/partner-settlement-control";
import type {
  SettlementLike,
  SettlementPaymentLike,
} from "../../src/domain/partner-settlement";

const root = process.cwd();
const financeAccessMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260901033000_harden_partner_finance_organization_status.sql"),
  "utf8",
);
const freightMigration = readFileSync(
  path.join(root, "supabase", "migrations", "20260901090000_harden_partner_freight_accrual_org_status.sql"),
  "utf8",
);
const financePage = readFileSync(path.join(root, "src", "pages", "AdminPartnerFinance.tsx"), "utf8");
const settlementWorkflow = readFileSync(
  path.join(root, "src", "components", "partner", "AdminPartnerSettlementWorkflow.tsx"),
  "utf8",
);

type PartnerFinanceContext = {
  leadership: boolean;
  samePartner: boolean;
  membershipActive: boolean;
  memberRole: "owner" | "admin" | "editor" | "viewer";
  organizationStatus: "active" | "suspended" | "archived";
};

function canViewPartnerFinance(context: PartnerFinanceContext) {
  return context.leadership || (
    context.samePartner
    && context.membershipActive
    && (context.memberRole === "owner" || context.memberRole === "admin")
    && context.organizationStatus === "active"
  );
}

test("active organization owner and admin retain Partner finance access", () => {
  for (const memberRole of ["owner", "admin"] as const) {
    assert.equal(canViewPartnerFinance({
      leadership: false,
      samePartner: true,
      membershipActive: true,
      memberRole,
      organizationStatus: "active",
    }), true);
  }
});

test("suspended and archived Partner organizations are denied", () => {
  for (const organizationStatus of ["suspended", "archived"] as const) {
    assert.equal(canViewPartnerFinance({
      leadership: false,
      samePartner: true,
      membershipActive: true,
      memberRole: "owner",
      organizationStatus,
    }), false);
  }
});

test("inactive, lower-privilege and cross-organization memberships are denied", () => {
  assert.equal(canViewPartnerFinance({ leadership: false, samePartner: true, membershipActive: false, memberRole: "owner", organizationStatus: "active" }), false);
  assert.equal(canViewPartnerFinance({ leadership: false, samePartner: true, membershipActive: true, memberRole: "editor", organizationStatus: "active" }), false);
  assert.equal(canViewPartnerFinance({ leadership: false, samePartner: true, membershipActive: true, memberRole: "viewer", organizationStatus: "active" }), false);
  assert.equal(canViewPartnerFinance({ leadership: false, samePartner: false, membershipActive: true, memberRole: "admin", organizationStatus: "active" }), false);
});

test("active leadership path remains available for remediation", () => {
  assert.equal(canViewPartnerFinance({
    leadership: true,
    samePartner: false,
    membershipActive: false,
    memberRole: "viewer",
    organizationStatus: "archived",
  }), true);
});

test("Partner finance read authorization remains database-backed and signed-in only", () => {
  assert.match(financeAccessMigration, /select \(select private\.is_admin_or_ceo\(\)\)/i);
  assert.match(financeAccessMigration, /join public\.partner_organizations organization/i);
  assert.match(financeAccessMigration, /organization\.status::text = 'active'/i);
  assert.match(financeAccessMigration, /revoke all on function public\.can_view_partner_finance\(uuid\) from public, anon/i);
  assert.match(financeAccessMigration, /grant execute on function public\.can_view_partner_finance\(uuid\) to authenticated, service_role/i);
  assert.doesNotMatch(financeAccessMigration, /auth\.jwt\(|app_metadata|user_metadata/i);
});

test("Partner freight accrual requires current leadership and an active organization", () => {
  const overloads = freightMigration.match(/create or replace function public\.admin_record_partner_freight/gi) ?? [];
  assert.equal(overloads.length, 2);
  assert.match(freightMigration, /auth\.uid\(\) is null or not \(select private\.is_admin_or_ceo\(\)\)/i);
  assert.match(freightMigration, /organization\.status::text = 'active'/i);
  assert.match(freightMigration, /Active Partner organization not found/i);
  assert.match(freightMigration, /return private\.record_partner_freight_internal/i);
  assert.match(freightMigration, /revoke all on function public\.admin_record_partner_freight\(uuid, uuid, uuid\)[\s\S]*from public, anon/i);
  assert.match(freightMigration, /grant execute on function public\.admin_record_partner_freight\(uuid, uuid, uuid, uuid\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(freightMigration, /app_metadata|user_metadata|raw_user_meta_data/i);
});

test("Admin Partner finance remains reviewable while inactive organization writes are locked", () => {
  assert.match(financePage, /selectedOrganization\.status !== "active"/i);
  assert.match(financePage, /data-testid="partner-finance-organization-lock"/i);
  assert.match(financePage, /to="\/admin\/partners"/i);
  assert.match(financePage, /disabled=\{busy\|\|partnerActionsLocked\}/i);
  assert.match(financePage, /actionsLocked=\{partnerActionsLocked\}/i);
  assert.match(financePage, /payableEtb=\{settlementControl\.payableEtb\}/i);
  assert.match(financePage, /partner-settlement-control-summary/i);
});

test("Settlement workflow caps requests to payable balance and locks every mutation", () => {
  assert.match(settlementWorkflow, /actionsLocked = false/i);
  assert.match(settlementWorkflow, /const workflowLocked = busy \|\| actionsLocked/i);
  assert.match(settlementWorkflow, /const noPayableBalance = availablePayable !== null && availablePayable <= 0/i);
  assert.match(settlementWorkflow, /max=\{availablePayable \?\? undefined\}/i);
  assert.match(settlementWorkflow, /if \(workflowLocked\) return;/i);
  assert.match(settlementWorkflow, /disabled=\{workflowLocked\}/i);
  assert.match(settlementWorkflow, /Available payable balance/i);
});

test("Partner settlement control summary prioritizes decisions and reconciles outstanding amounts", () => {
  const settlements: SettlementLike[] = [
    { id:"pending", partner_id:"partner", project_id:null, settlement_reference:"HPS-P", amount_etb:1000, status:"pending", created_at:"2026-09-01T00:00:00.000Z", paid_at:null },
    { id:"review", partner_id:"partner", project_id:null, settlement_reference:"HPS-R", amount_etb:500, status:"under_review", created_at:"2026-09-01T00:00:00.000Z", paid_at:null },
    { id:"approved", partner_id:"partner", project_id:null, settlement_reference:"HPS-A", amount_etb:800, status:"approved", created_at:"2026-09-01T00:00:00.000Z", paid_at:null },
    { id:"partial", partner_id:"partner", project_id:null, settlement_reference:"HPS-PP", amount_etb:1000, status:"partially_paid", created_at:"2026-09-01T00:00:00.000Z", paid_at:null },
    { id:"rejected", partner_id:"partner", project_id:null, settlement_reference:"HPS-X", amount_etb:200, status:"rejected", created_at:"2026-09-01T00:00:00.000Z", paid_at:null },
    { id:"reversed", partner_id:"partner", project_id:null, settlement_reference:"HPS-Z", amount_etb:400, status:"reversed", created_at:"2026-09-01T00:00:00.000Z", paid_at:null },
  ];
  const payments: SettlementPaymentLike[] = [{
    id:"payment", settlement_id:"partial", partner_id:"partner", amount_etb:300,
    payment_method:"bank_transfer", provider:"CBE", transaction_ref:"CBE-300",
    paid_at:"2026-09-01T01:00:00.000Z",
  }];

  const summary = buildPartnerSettlementControlSummary(settlements, payments, [], 2500);
  assert.deepEqual(summary, {
    payableEtb: 2500,
    activeRequestEtb: 3000,
    pendingReviewCount: 1,
    underReviewCount: 1,
    payableSettlementCount: 2,
    outstandingApprovedEtb: 1500,
    exceptionCount: 2,
    nextAction: "Approve or reject 1 settlement.",
  });
});
