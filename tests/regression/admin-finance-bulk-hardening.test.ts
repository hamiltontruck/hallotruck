import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911022227_admin_finance_aggregation_hardening.sql", "utf8");

test("Admin dashboard bounds normal payment and proof previews", () => {
  assert.match(service, /ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT = 100/);
  assert.match(service, /basePaymentsQuery\.limit\(ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT\)/);
  assert.match(service, /baseProofsQuery\.limit\(ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT\)/);
});

test("Admin dashboard revenue uses database-side finance aggregation", () => {
  assert.match(service, /supabase\.rpc\("admin_finance_dashboard_summary"\)/);
  assert.match(service, /financeSummary\?\.released_total_etb/);
  assert.match(service, /financeSummary\?\.refunded_total_etb/);
  assert.doesNotMatch(service, /payments\s*\.filter\(\(payment\) => payment\.event === "released"\)/);
});

test("Finance aggregate RPC is leadership-guarded and security invoker", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /revoke all on function public\.admin_finance_dashboard_summary\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_finance_dashboard_summary\(\) to authenticated/i);
});

test("Finance preview ordering has supporting indexes", () => {
  assert.match(migration, /payments_created_at_desc_idx/);
  assert.match(migration, /delivery_proofs_delivered_at_desc_idx/);
});
