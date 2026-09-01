import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260901054500_restrict_dispatch_readiness_execute.sql",
);
const migration = await readFile(migrationPath, "utf8");

const dispatchMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260828200000_align_dispatch_with_selected_payment_method.sql",
);
const dispatchMigration = await readFile(dispatchMigrationPath, "utf8");

test("dispatch readiness is no longer directly executable by authenticated users", () => {
  assert.match(
    migration,
    /revoke all on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*to authenticated/i,
  );
});

test("service-role dispatch workflows retain the minimum required execute grant", () => {
  assert.match(
    migration,
    /grant execute on function public\.order_payment_ready_for_dispatch\(uuid\)[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(migration, /grant all/i);
});

test("existing database-side dispatch guards continue to use the helper", () => {
  assert.match(
    dispatchMigration,
    /create or replace function public\.enforce_verified_payment_before_dispatch\(\)[\s\S]*public\.order_payment_ready_for_dispatch\(new\.id\)/i,
  );
  assert.match(dispatchMigration, /security definer/i);
});

test("authorization-only migration does not change financial or order data", () => {
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.match(migration, /begin;/i);
  assert.match(migration, /commit;/i);
});
