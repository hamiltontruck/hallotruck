import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260901074500_atomic_partner_commission_rules.sql"),
  "utf8",
);
const service = readFileSync(
  path.join(process.cwd(), "src", "services", "partner-finance.service.ts"),
  "utf8",
);

test("Partner commission activation is one authorized database transaction", () => {
  assert.match(migration, /create or replace function public\.admin_activate_partner_commission_rule/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /organization\.status::text = 'active'/i);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(migration, /update public\.partner_commission_rules[\s\S]*insert into public\.partner_commission_rules/i);
  assert.match(migration, /partner_commission_rule_activated/i);
});

test("Partner commission validation and single-active-rule invariant are server enforced", () => {
  assert.match(migration, /where active;/i);
  assert.match(migration, /partner_commission_rules_one_active_per_partner/i);
  assert.match(migration, /v_type not in \('percentage', 'fixed'\)/i);
  assert.match(migration, /p_commission_value < 0/i);
  assert.match(migration, /p_commission_value > 100/i);
  assert.match(migration, /new rule cannot start before the active rule/i);
});

test("Authenticated clients can read rules but cannot mutate them directly", () => {
  assert.match(migration, /revoke insert, update, delete on table public\.partner_commission_rules[\s\S]*from authenticated/i);
  assert.match(migration, /grant select on table public\.partner_commission_rules[\s\S]*to authenticated/i);
  assert.match(migration, /revoke all on function public\.admin_activate_partner_commission_rule[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_activate_partner_commission_rule[\s\S]*to authenticated, service_role/i);
});

test("Partner finance service uses only the atomic activation RPC", () => {
  const createRule = service.match(/export async function createCommissionRule[\s\S]*?\n}\n\nexport async function addPartnerVehicle/)?.[0] ?? "";
  assert.match(createRule, /supabase\.rpc\("admin_activate_partner_commission_rule"/i);
  assert.doesNotMatch(createRule, /\.from\("partner_commission_rules"\)\.update/i);
  assert.doesNotMatch(createRule, /\.from\("partner_commission_rules"\)\.insert/i);
});
