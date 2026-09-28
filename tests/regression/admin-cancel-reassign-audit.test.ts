import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync("src/services/admin.service.ts", "utf8");
const page = readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const greenSql = readFileSync("supabase/migrations/20260928010000_admin_cancel_reassign_audit.sql", "utf8");

test("admin cancellation requires an explicit reason with no fallback", () => {
  assert.match(service, /adminCancelOrder\(orderId: string, reason: string\)/);
  assert.doesNotMatch(service, /Cancelled by Admin from Manage Order/);
  assert.match(page, /cancelReason\.trim\(\)\.length\s*>=\s*5/);
});

test("admin cancel RPC does not default a missing reason", () => {
  assert.match(greenSql, /admin_cancel_order\([\s\S]*p_reason text/);
  assert.doesNotMatch(greenSql, /p_reason text default null/);
  assert.doesNotMatch(greenSql, /coalesce\(nullif\(btrim\(p_reason\), ''\)/);
});

test("reassignment has a dedicated reason-aware admin operation", () => {
  assert.match(service, /adminReassignOrder/);
  assert.match(page, /Reassignment reason/);
});

test("cancel and reassign append immutable order audit history", () => {
  assert.match(greenSql, /order_assignment_history/i);
  assert.match(greenSql, /insert into public\.order_assignment_history/i);
  assert.match(greenSql, /revoke insert, update, delete/i);
});
