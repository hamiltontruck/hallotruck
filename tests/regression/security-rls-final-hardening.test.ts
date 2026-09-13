import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rlsMigration = readFileSync(
  "supabase/migrations/20260913151910_security_rls_final_hardening.sql",
  "utf8",
);
const aclMigration = readFileSync(
  "supabase/migrations/20260913152200_security_acl_final_hardening.sql",
  "utf8",
);
const dispatchMigration = readFileSync(
  "supabase/migrations/20260913152411_restrict_internal_dispatch_readiness_execute_final.sql",
  "utf8",
);
const productionMarker = readFileSync(
  "supabase/production-migration-version.txt",
  "utf8",
).trim();

test("production marker includes the final security migration", () => {
  assert.match(productionMarker, /^\d{14}$/);
  assert.ok(productionMarker >= "20260913152411", "production must include the verified security migrations");
});

test("RLS hardening uses initPlan-safe DB-backed authorization", () => {
  assert.match(rlsMigration, /select private\.is_admin_or_ceo\(\)/);
  assert.match(rlsMigration, /select auth\.uid\(\)/);
  assert.doesNotMatch(rlsMigration, /auth\.jwt\(\)/);
  assert.match(rlsMigration, /create policy "orders select authorized"/);
  assert.match(rlsMigration, /create policy "profiles select authorized"/);
  assert.match(rlsMigration, /mobile_devices_select_own_or_leadership/);
  assert.match(rlsMigration, /"push outbox: leadership reads"/);
  assert.match(rlsMigration, /"push deliveries: leadership reads"/);
});

test("overlapping legacy policies are explicitly removed", () => {
  for (const policy of [
    '"orders admin manage"',
    '"profiles admin manage"',
    '"profiles: self or admin read"',
    '"notifications: admin reads all"',
    'trucks_leadership_read',
  ]) {
    assert.match(rlsMigration, new RegExp(`drop policy if exists ${policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("API roles lose structural and unsupported direct-write privileges", () => {
  assert.match(
    rlsMigration,
    /revoke truncate, references, trigger, maintain[\s\S]*from anon, authenticated;/,
  );
  assert.match(aclMigration, /revoke insert, update, delete on table public\.orders from anon;/);
  assert.match(aclMigration, /public\.push_notification_outbox from authenticated;/);
  assert.match(aclMigration, /public\.push_notification_deliveries from authenticated;/);
});

test("internal dispatch readiness helper is not a public authenticated RPC", () => {
  assert.match(
    dispatchMigration,
    /revoke execute on function public\.order_payment_ready_for_dispatch\(uuid\) from public, anon, authenticated;/,
  );
  assert.match(
    dispatchMigration,
    /grant execute on function public\.order_payment_ready_for_dispatch\(uuid\) to service_role;/,
  );
});
