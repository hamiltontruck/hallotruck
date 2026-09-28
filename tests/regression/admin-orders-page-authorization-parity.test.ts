import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260912152406_admin_orders_page_rpc.sql",
  "utf8",
);

test("admin_orders_page enforces active Admin/CEO authorization", () => {
  assert.match(migration, /private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /grant execute on function public\.admin_orders_page[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.admin_orders_page[\s\S]*to (?:public|anon)/i);
});
