import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260901033000_require_active_partner_finance_organization.sql"),
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
    && ["owner", "admin"].includes(context.memberRole)
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

test("suspended and archived Partner organizations fail closed", () => {
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

test("active leadership authorization remains database-backed", () => {
  assert.equal(canViewPartnerFinance({ leadership: true, samePartner: false, membershipActive: false, memberRole: "viewer", organizationStatus: "archived" }), true);
  assert.match(migration, /select\s+\(select private\.is_admin_or_ceo\(\)\)/i);
  assert.doesNotMatch(migration, /auth\.jwt\(|app_metadata|user_metadata/i);
});

test("Partner finance helper joins the organization and requires active status", () => {
  assert.match(migration, /join public\.partner_organizations organization[\s\S]*organization\.id\s*=\s*membership\.partner_id/i);
  assert.match(migration, /membership\.partner_id\s*=\s*p_partner_id/i);
  assert.match(migration, /membership\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /membership\.active/i);
  assert.match(migration, /membership\.member_role in \('owner', 'admin'\)/i);
  assert.match(migration, /organization\.status\s*=\s*'active'/i);
});

test("wallet, settlements, fleet and commission policies are migration-verified", () => {
  for (const [tableName, policyName] of [
    ["partner_commission_rules", "partner_commission_rules_select"],
    ["partner_fleet_vehicles", "partner_fleet_select"],
    ["partner_freight_earnings", "partner_earnings_select"],
    ["partner_settlements", "partner_settlements_select"],
    ["partner_settlement_events", "partner_settlement_events_authorized_read"],
    ["partner_settlement_payments", "partner_settlement_payments_authorized_read"],
  ]) {
    assert.ok(migration.includes(`'public', '${tableName}', '${policyName}'`), `missing policy verification for ${policyName}`);
  }
  assert.match(migration, /from \([\s\S]*values[\s\S]*left join pg_catalog\.pg_policies policy/i);
  assert.match(migration, /coalesce\(policy\.qual, ''\) not ilike '%can_view_partner_finance%'/i);
  assert.match(migration, /raise exception 'Partner finance policies missing hardened helper coverage/i);
});

test("function execution remains unavailable to signed-out callers", () => {
  assert.match(migration, /revoke all on function public\.can_view_partner_finance\(uuid\)[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.can_view_partner_finance\(uuid\)[\s\S]*to authenticated, service_role/i);
  assert.match(migration, /security definer[\s\S]*set search_path\s*=\s*''/i);
});

test("authorization migration does not mutate production business data", () => {
  const executable = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(executable, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i);
  assert.doesNotMatch(executable, /disable\s+row\s+level\s+security|grant\s+all/i);
});
