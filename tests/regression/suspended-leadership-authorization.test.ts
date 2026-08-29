import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260829173000_harden_suspended_leadership_authorization.sql",
);
const migration = await readFile(migrationPath, "utf8");

const hardenedAdminFunctions = [
  "admin_approve_driver_onboarding",
  "admin_assign_order",
  "admin_finalize_driver_onboarding",
  "admin_get_customer_dispatch_request",
  "admin_order_assignment_candidates",
  "admin_record_driver_deposit",
  "admin_record_payment",
  "admin_restore_driver",
  "admin_reverse_driver_commission_deposit",
  "admin_review_driver_commission_payment",
  "admin_suspend_driver",
  "admin_transition_order",
  "admin_update_quote_pricing_rule",
  "admin_update_quote_pricing_rule_v2",
  "admin_upsert_driver_document",
];

test("shared leadership helper is database-backed and rejects suspended profiles", () => {
  assert.match(migration, /create or replace function private\.require_active_leadership/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /from public\.profiles profile/);
  assert.match(migration, /profile\.role::text in \('admin', 'ceo'\)/);
  assert.match(migration, /coalesce\(profile\.driver_status::text, 'active'\) <> 'suspended'/);
  assert.match(migration, /raise exception 'Active Admin or CEO authorization is required\.'/);
  assert.match(migration, /set search_path = ''/);
});

test("active Admin and CEO are derived from the current profile, not a stale JWT", () => {
  assert.match(migration, /select profile\.role::text[\s\S]*where profile\.id = v_actor/);
  assert.match(migration, /jsonb_build_object\('role', v_profile_role\)/);
  assert.match(migration, /only after the current database profile has been verified/i);
});

test("all discovered JWT-only Admin RPCs execute through the shared guard", () => {
  for (const functionName of hardenedAdminFunctions) {
    assert.match(
      migration,
      new RegExp(`create function public\\.${functionName}\\b[\\s\\S]*?private\\.require_active_leadership\\(\\s*'${functionName}'`),
      `${functionName} must call the shared authorization guard`,
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${functionName}_unchecked_188`),
      `${functionName} legacy implementation must not remain client-executable`,
    );
  }
});

test("mixed-role RPCs preserve owner access but require active leadership for override", () => {
  assert.match(migration, /create function public\.customer_get_live_trip[\s\S]*trip_order\.customer_id = v_actor or trip_order\.driver_id = v_actor/);
  assert.match(migration, /private\.require_active_leadership\('customer_get_live_trip'\)/);
  assert.match(migration, /create function public\.submit_delivery_proof[\s\S]*v_assigned_driver is distinct from v_actor[\s\S]*private\.require_active_leadership\('submit_delivery_proof'\)/);
  assert.match(migration, /create function public\.driver_commission_balance[\s\S]*p_driver_id is distinct from v_actor[\s\S]*private\.require_active_leadership\('driver_commission_balance'\)/);
  assert.match(migration, /create function public\.driver_financial_summary[\s\S]*p_driver_id is distinct from v_actor[\s\S]*private\.require_active_leadership\('driver_financial_summary'\)/);
});

test("service-role exceptions are explicit and narrow", () => {
  assert.match(migration, /p_allow_service_role boolean default false/);
  assert.match(migration, /p_allow_service_role and v_auth_role = 'service_role'/);
  assert.match(migration, /admin_get_customer_dispatch_request'[\s\S]*true/);
  assert.match(migration, /admin_order_assignment_candidates'[\s\S]*true/);
  assert.match(migration, /grant execute on function public\.driver_financial_summary\(uuid\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function private\.require_active_leadership[\s\S]*to service_role/);
});

test("function grants and search paths do not broaden authenticated access", () => {
  assert.match(migration, /revoke all on function private\.require_active_leadership\(text, boolean\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function private\.is_admin_or_ceo\(\) from public, anon/);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /grant all/i);
});

test("required Issue 188 RPCs are explicitly covered", () => {
  for (const required of [
    "private.is_admin_or_ceo",
    "admin_assign_order",
    "admin_record_payment",
    "admin_transition_order",
    "admin_approve_driver_onboarding",
  ]) {
    assert.match(migration, new RegExp(required.replace(".", "\\.")));
  }
});
