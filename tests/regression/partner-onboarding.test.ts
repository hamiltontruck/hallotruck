import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  canChangeMembership,
  canPartnerLogin,
  canPromoteToPartner,
  filterPartnerOrganizations,
  getPartnerPromotionWarning,
  getPartnerReadiness,
  isDatabaseLeadershipRole,
  validatePartnerOrganization,
  type PartnerMemberSummary,
  type PartnerOrganizationSummary,
} from "../../src/domain/partner-onboarding";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase", "migrations", "20260826013000_admin_partner_onboarding_control.sql"), "utf8");
const adminPage = readFileSync(path.join(root, "src", "pages", "AdminPartnerControl.tsx"), "utf8");
const adminGate = readFileSync(path.join(root, "src", "components", "auth", "AdminGate.tsx"), "utf8");
const partnerGate = readFileSync(path.join(root, "src", "components", "auth", "PartnerGate.tsx"), "utf8");
const signupRoleMigration = readFileSync(path.join(root, "supabase", "migrations", "20260813_sync_auth_role_metadata.sql"), "utf8");

function organization(overrides: Partial<PartnerOrganizationSummary> = {}): PartnerOrganizationSummary {
  return {
    id: "organization-a", name: "Abiy Logistics", code: "ABIY-01", status: "active",
    contact_email: "ops@abiy.example", contact_phone: "+251911000000", created_at: "2026-08-26T00:00:00.000Z",
    owner_name: "Abiyu Nagash", active_member_count: 2, partner_role_count: 2, active_owner_count: 1,
    project_count: 4, pending_document_count: 1, pending_payment_count: 2,
    latest_activity: "membership_created", latest_activity_at: "2026-08-26T01:00:00.000Z", ...overrides,
  };
}

function member(overrides: Partial<PartnerMemberSummary> = {}): PartnerMemberSummary {
  return {
    id: "membership-owner", partner_id: "organization-a", user_id: "user-owner", member_role: "owner", active: true,
    created_at: "2026-08-26T00:00:00.000Z", full_name: "Abiyu Nagash", email: "owner@example.com",
    phone: "+251911000000", profile_role: "partner", account_status: "active", ...overrides,
  };
}

test("Partner organization validation normalizes uppercase codes and rejects invalid production input", () => {
  const valid = validatePartnerOrganization({ name: "  Abiy Logistics  ", code: "abiy partner", contactEmail: "OPS@EXAMPLE.COM", contactPhone: "+251911000000", status: "active" });
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized.code, "ABIY-PARTNER");
  assert.equal(valid.normalized.contactEmail, "ops@example.com");

  const invalid = validatePartnerOrganization({ name: "A", code: "bad/code", contactEmail: "wrong", contactPhone: "123", status: "active" });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.code ?? "", /uppercase letters/i);
  assert.match(invalid.errors.contactEmail ?? "", /valid contact email/i);
});

test("Organization search and readiness filters include exact access reasons", () => {
  assert.equal(getPartnerReadiness(organization()).loginReady, true);
  assert.equal(getPartnerReadiness(organization({ partner_role_count: 0 })).reason, "No member account has the Partner profile role.");
  assert.equal(getPartnerReadiness(organization({ active_member_count: 0 })).reason, "No active Partner membership exists.");
  assert.equal(getPartnerReadiness(organization({ active_owner_count: 0 })).reason, "No active owner is assigned.");
  assert.equal(getPartnerReadiness(organization({ status: "suspended" })).reason, "Organization is suspended.");
  assert.deepEqual(filterPartnerOrganizations([organization(), organization({ id: "b", name: "Mojo Freight", code: "MOJO", status: "archived" })], "abiy", "active", "ready").map((row) => row.id), ["organization-a"]);
});

test("Safe Partner promotion warns Customer and Driver accounts and protects leadership", () => {
  assert.equal(canPromoteToPartner("customer"), true);
  assert.equal(canPromoteToPartner("driver"), true);
  assert.equal(canPromoteToPartner("partner"), true);
  assert.equal(canPromoteToPartner("admin"), false);
  assert.equal(canPromoteToPartner("ceo"), false);
  assert.match(getPartnerPromotionWarning({ full_name: "Mebruk", profile_role: "driver" }), /driver portal role will be replaced/i);
  assert.match(getPartnerPromotionWarning({ full_name: "CEO", profile_role: "ceo" }), /protected/i);
});

test("Admin route authorization accepts only database Admin and CEO roles", () => {
  assert.equal(isDatabaseLeadershipRole("admin"), true);
  assert.equal(isDatabaseLeadershipRole("ceo"), true);
  assert.equal(isDatabaseLeadershipRole("partner"), false);
  assert.equal(isDatabaseLeadershipRole("customer"), false);
  assert.equal(isDatabaseLeadershipRole("driver"), false);
  assert.equal(isDatabaseLeadershipRole(null), false);
});

test("Final active owner cannot be disabled or demoted before ownership transfer", () => {
  const onlyOwner = [member()];
  assert.equal(canChangeMembership(onlyOwner, "membership-owner", "admin", "active").allowed, false);
  assert.equal(canChangeMembership(onlyOwner, "membership-owner", "owner", "disabled").allowed, false);
  const withSecondOwner = [member(), member({ id: "membership-owner-2", user_id: "user-owner-2", full_name: "Second Owner" })];
  assert.equal(canChangeMembership(withSecondOwner, "membership-owner", "admin", "active").allowed, true);
});

test("Partner login requires Partner role, active membership and active organization", () => {
  assert.equal(canPartnerLogin("partner", true, "active"), true);
  assert.equal(canPartnerLogin("customer", true, "active"), false);
  assert.equal(canPartnerLogin("partner", false, "active"), false);
  assert.equal(canPartnerLogin("partner", true, "suspended"), false);
  assert.equal(canPartnerLogin("admin", true, "active"), false);
});

test("Onboarding migration uses database roles, audited RPCs and final-owner protection", () => {
  assert.match(migration, /private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /from public\.profiles[\s\S]*role::text in \('admin', 'ceo'\)|private\.is_admin_or_ceo/i);
  assert.match(migration, /admin_search_partner_profiles/i);
  assert.match(migration, /full_name[\s\S]*email[\s\S]*phone[\s\S]*profile_role[\s\S]*account_status/i);
  assert.match(migration, /Admin and CEO roles are protected and cannot be replaced/i);
  assert.match(migration, /Confirm the Customer or Driver portal role replacement/i);
  assert.match(migration, /profile_role_changed/i);
  assert.match(migration, /update auth\.users[\s\S]*raw_app_meta_data[\s\S]*'partner'/i);
  assert.match(migration, /membership_created/i);
  assert.match(migration, /guard_partner_final_owner/i);
  assert.match(migration, /The final active owner cannot be disabled, demoted or removed/i);
  assert.match(migration, /admin_transfer_partner_ownership/i);
  assert.match(migration, /ownership_transferred/i);
  assert.match(migration, /Organization code already exists/i);
  assert.match(migration, /Enter a valid contact email address/i);
  assert.match(migration, /Contact phone must contain 7–30 characters/i);
  assert.match(migration, /revoke insert, update, delete on public\.partner_organizations from authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_onboard_partner_member/i);
  assert.match(migration, /revoke all on function public\.admin_onboard_partner_member[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data/i);
});

test("Suspended organizations are excluded by existing Partner RLS helper policies", () => {
  assert.match(migration, /create or replace function private\.is_partner_member/i);
  assert.match(migration, /organization\.status = 'active'/i);
  assert.match(migration, /membership\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /membership\.partner_id = p_partner_id/i);
  assert.match(migration, /guard_partner_tenant_relationships/i);
  assert.match(migration, /Project does not belong to the selected Partner organization/i);
});

test("Admin and Partner gates use database-backed access instead of metadata", () => {
  assert.match(adminGate, /from\("profiles"\)[\s\S]*select\("role"\)/i);
  assert.doesNotMatch(adminGate, /app_metadata|user_metadata/i);
  assert.match(partnerGate, /getPartnerLoginAccess/i);
  assert.match(partnerGate, /no active organization membership/i);
  assert.match(partnerGate, /suspended or archived/i);
});

test("Public signup cannot self-assign Partner, Admin or CEO", () => {
  assert.match(signupRoleMigration, /when new\.raw_user_meta_data ->> 'role' = 'customer'[\s\S]*else 'driver'/i);
  assert.doesNotMatch(signupRoleMigration, /raw_user_meta_data ->> 'role' = '(partner|admin|ceo)'/i);
  assert.match(migration, /revoke insert, update, delete on public\.partner_memberships from authenticated/i);
});

test("Admin onboarding UI removes UUID paste and exposes only working control actions", () => {
  assert.match(adminPage, /Search by full name, email or phone/i);
  assert.doesNotMatch(adminPage, /Profile user ID/i);
  for (const label of ["Open Partner Login", "Open Partner Dashboard", "Open Organization Details", "Suspend", "Reactivate", "Archive", "Transfer ownership"]) {
    assert.match(adminPage, new RegExp(label, "i"));
  }
  assert.match(adminPage, /overflow-x-hidden/);
  assert.match(adminPage, /break-all/);
  assert.match(adminPage, /ConfirmationDialog/);
});
