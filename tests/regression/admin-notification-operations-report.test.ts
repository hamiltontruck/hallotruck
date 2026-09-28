import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260928013000_admin_notification_operations_report.sql",
  "utf8",
);

const report = migration.match(
  /create or replace function public\.admin_notification_operations_report[\s\S]*?\$function\$;/i,
)?.[0] ?? "";

test("admin notification operations report is paginated and leadership guarded", () => {
  assert.match(report, /p_page\s+integer\s+default\s+1/i);
  assert.match(report, /p_page_size\s+integer\s+default\s+50/i);
  assert.match(report, /p_page_size\s+not\s+in\s*\(50\s*,\s*100\)/i);
  assert.match(report, /private\.require_active_leadership\(/i);
});

test("admin notification operations report links notification and outbox retry state", () => {
  assert.match(report, /public\.notifications\s+n/i);
  assert.match(report, /public\.push_notification_outbox\s+o/i);
  assert.match(report, /o\.notification_id\s*=\s*n\.id/i);
  for (const field of ["status", "attempts", "next_attempt_at", "last_error"]) {
    assert.match(report, new RegExp(`o\\.${field}`, "i"));
  }
});
