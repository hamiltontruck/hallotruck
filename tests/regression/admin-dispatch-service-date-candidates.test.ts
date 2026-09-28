import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260928001500_admin_assignment_candidates_service_date.sql",
  "utf8",
);

test("admin candidate filtering uses the target order service_date", () => {
  assert.match(migration, /select o\.pickup, o\.vehicle_type, o\.cargo_weight_tons, o\.service_date/i);
});

test("a driver assigned on another date remains a candidate", () => {
  assert.match(migration, /busy_order\.service_date\s*=\s*requested\.service_date/i);
  assert.doesNotMatch(migration, /busy_order\.status\s+in\s*\([^)]*accepted[^)]*in_transit/i);
});

test("a driver already assigned on the requested service_date is excluded", () => {
  assert.match(migration, /busy_order\.driver_id\s*=\s*p\.id[\s\S]*busy_order\.service_date\s*=\s*requested\.service_date/i);
});


test("admin assignment candidates require active leadership instead of raw JWT role checks", () => {
  assert.match(migration, /private\.require_active_leadership\(/i);
  assert.doesNotMatch(migration, /auth\.jwt\(\)[\s\S]*app_metadata[\s\S]*role/i);
  assert.doesNotMatch(migration, /v_role\s+not\s+in\s*\(\s*'admin'\s*,\s*'ceo'/i);
});
