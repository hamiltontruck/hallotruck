import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const hardeningPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905213000_rpc_rls_security_audit_hardening.sql",
);
const hardening = await readFile(hardeningPath, "utf8");
const hardeningSql = hardening.replace(/--.*$/gm, "");

const legacyRestorationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260902065000_legacy_over_refund_restoration.sql",
);
const legacyRestoration = await readFile(legacyRestorationPath, "utf8");

const leadershipPath = path.join(
  process.cwd(),
  "supabase/migrations/20260829173000_harden_suspended_leadership_authorization.sql",
);
const leadership = await readFile(leadershipPath, "utf8");

test("dispatch readiness execute regression is closed without breaking service workflows", () => {
  assert.match(
    legacyRestoration,
    /grant execute on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*to authenticated/i,
  );
  assert.match(
    hardening,
    /revoke all on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    hardening,
    /grant execute on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(
    hardening,
    /grant execute on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*to authenticated/i,
  );
});

test("trigger-only private helper is not directly executable by API roles", () => {
  assert.match(
    hardening,
    /revoke all on function private\.reject_driver_trip_payment_result_mutation\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    hardening,
    /grant execute on function private\.reject_driver_trip_payment_result_mutation\(\)/i,
  );
});

test("mobile and push leadership RLS uses current database profile state", () => {
  for (const policyName of [
    "mobile_devices_select_own_or_admin",
    "push outbox: admin reads",
    "push deliveries: admin reads",
  ]) {
    const escaped = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      hardening,
      new RegExp(`alter policy [\\"]?${escaped}[\\"]?[\\s\\S]*?private\\.is_admin_or_ceo\\(\\)`, "i"),
      `${policyName} must use the database-backed leadership helper`,
    );
  }
  assert.doesNotMatch(hardeningSql, /auth\.jwt\(\)/i);
  assert.doesNotMatch(hardeningSql, /app_metadata/i);
  assert.doesNotMatch(hardeningSql, /user_metadata/i);
});

test("all audited auth RLS init-plan warnings use select-wrapped auth helpers", () => {
  const expectedPolicies = [
    "orders: customer creates",
    "tracking: driver inserts own",
    "profiles: self or admin read",
    "docs: driver own or admin",
    "tracking: participants or admin read",
    "driver verification history own read",
    "mobile_devices_select_own_or_admin",
    "notifications: user reads own",
    "push outbox: admin reads",
    "push deliveries: admin reads",
  ];

  for (const policyName of expectedPolicies) {
    assert.match(
      hardening,
      new RegExp(`alter policy [\\"]?${policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\"]?`, "i"),
      `${policyName} must be included in the audited hardening set`,
    );
  }

  assert.doesNotMatch(hardeningSql, /(?<!select )auth\.uid\(\)/i);
  assert.doesNotMatch(hardeningSql, /(?<!select )public\.is_admin\(\)/i);
  assert.doesNotMatch(hardeningSql, /(?<!select )private\.is_admin_or_ceo\(\)/i);
});

test("leadership authorization remains database-backed and fails closed after demotion or suspension", () => {
  assert.match(leadership, /from public\.profiles profile/i);
  assert.match(leadership, /profile\.id = v_actor/i);
  assert.match(leadership, /profile\.role::text in \('admin', 'ceo'\)/i);
  assert.match(leadership, /coalesce\(profile\.driver_status::text, 'active'\) <> 'suspended'/i);
  assert.match(leadership, /raise exception 'Active Admin or CEO authorization is required\.'/i);
});

test("audit hardening is authorization-only and leaves extension-owned tables alone", () => {
  assert.doesNotMatch(hardeningSql, /\b(insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(hardeningSql, /enable row level security/i);
  assert.doesNotMatch(hardeningSql, /spatial_ref_sys/i);
  assert.doesNotMatch(hardeningSql, /grant all/i);
  assert.match(hardening, /begin;/i);
  assert.match(hardening, /commit;/i);
});
