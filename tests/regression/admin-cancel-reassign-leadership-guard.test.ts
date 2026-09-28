import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260928010000_admin_cancel_reassign_audit.sql",
  "utf8",
);

test("cancel and reassign use centralized active leadership authorization", () => {
  const cancel = migration.match(/create or replace function public\.admin_cancel_order[\s\S]*?\$function\$;/i)?.[0] ?? "";
  const reassign = migration.match(/create or replace function public\.admin_reassign_order[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.match(cancel, /private\.require_active_leadership\(/i);
  assert.match(reassign, /private\.require_active_leadership\(/i);
  assert.doesNotMatch(cancel, /private\.is_admin_or_ceo\(\)/i);
  assert.doesNotMatch(reassign, /private\.is_admin_or_ceo\(\)/i);
});