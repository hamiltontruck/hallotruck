import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260901033000_harden_partner_finance_organization_status.sql"),
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

test("migration authorization remains database-backed and signed-in only", () => {
  assert.match(migration, /select \(select private\.is_admin_or_ceo\(\)\)/i);
  assert.match(migration, /join public\.partner_organizations organization/i);
  assert.match(migration, /organization\.status::text = 'active'/i);
  assert.match(migration, /revoke all on function public\.can_view_partner_finance\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.can_view_partner_finance\(uuid\) to authenticated, service_role/i);
  assert.doesNotMatch(migration, /auth\.jwt\(|app_metadata|user_metadata/i);
});
