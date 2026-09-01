import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260901053000_harden_tracking_read_authorization.sql",
);
const functionPath = path.join(
  process.cwd(),
  "supabase/functions/tracking/index.ts",
);

const migration = await readFile(migrationPath, "utf8");
const edgeFunction = await readFile(functionPath, "utf8");
const migrationSql = migration.replace(/--.*$/gm, "");

test("tracking reads use one database-backed SECURITY DEFINER boundary", () => {
  assert.match(migration, /create or replace function public\.get_latest_tracking_point\(p_order_id uuid\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /from public\.profiles p/);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/);
});

test("active leadership access is current-profile based and stale JWT claims are absent", () => {
  assert.match(migration, /elsif not private\.is_admin_or_ceo\(\) then/);
  assert.doesNotMatch(migrationSql, /app_metadata/i);
  assert.doesNotMatch(migrationSql, /user_metadata/i);
  assert.doesNotMatch(migrationSql, /auth\.jwt\(\)/i);
  assert.doesNotMatch(edgeFunction, /app_metadata/i);
  assert.doesNotMatch(edgeFunction, /user_metadata/i);
});

test("missing profiles and cross-role participants fail closed", () => {
  assert.match(migration, /if not found then\s+raise exception 'Active profile required'/);
  assert.match(migration, /v_actor = v_customer_id[\s\S]*v_profile_role <> 'customer'/);
  assert.match(migration, /v_actor = v_driver_id[\s\S]*v_profile_role <> 'driver'/);
  assert.match(migration, /raise exception 'Not authorized for this order'/);
});

test("suspended or rejected assigned drivers are denied", () => {
  assert.match(migration, /coalesce\(v_driver_status, ''\) in \('suspended', 'rejected'\)/);
  assert.match(migration, /raise exception 'Active assigned Driver profile required'/);
});

test("RPC grants expose only the authenticated user boundary", () => {
  assert.match(
    migration,
    /revoke all on function public\.get_latest_tracking_point\(uuid\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_latest_tracking_point\(uuid\)[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute on function public\.get_latest_tracking_point\(uuid\)[\s\S]*to service_role/);
});

test("Edge Function executes the read RPC with the caller JWT", () => {
  assert.match(edgeFunction, /SUPABASE_ANON_KEY/);
  assert.match(edgeFunction, /Authorization: `Bearer \$\{token\}`/);
  assert.match(edgeFunction, /userClient\.rpc\("get_latest_tracking_point"/);
  assert.doesNotMatch(
    edgeFunction,
    /service\s*\.from\("tracking_pings"\)[\s\S]*\.select\(/,
  );
});

test("tracking hardening does not broaden RLS, Storage, or data mutation scope", () => {
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /grant all/i);
  assert.doesNotMatch(migration, /storage\./i);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into|public\.)/i);
  assert.match(migration, /begin;/i);
  assert.match(migration, /commit;/i);
});
