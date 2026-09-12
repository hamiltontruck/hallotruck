import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync("src/App.tsx", "utf8");
const page = fs.readFileSync("src/pages/AdminReports.tsx", "utf8");
const legacyPanel = fs.readFileSync("src/components/admin/AdminReportsPanel.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-reports.service.ts", "utf8");
const legacyMigration = fs.readFileSync("supabase/migrations/20260911195014_admin_reports_db_summary.sql", "utf8");
const v2Migration = fs.readFileSync("supabase/migrations/20260912200924_admin_reports_v2_filters.sql", "utf8");
const marker = fs.readFileSync("supabase/production-migration-version.txt", "utf8").trim();
const reportsV2MigrationVersion = "20260912200924";

assert.match(app, /section===\"Reports\"\)return <Navigate to=\"\/admin\/reports\" replace \/>/, "legacy Reports must redirect before SmartLogistics mounts");
assert.match(app, /path=\"\/admin\/reports\"/, "DB-backed Admin Reports route must exist");
assert.match(page, /getAdminReportsV2/, "live Admin Reports must use the V2 database report");
assert.match(service, /supabase\.rpc\(\"admin_reports_v2\"/, "Reports V2 service must use the reporting RPC");
assert.match(service, /ADMIN_REPORT_PAGE_SIZES = \[50, 100\]/, "Reports V2 must keep bounded page sizes");
assert.doesNotMatch(page, /\.from\(\"payments\"\)|\.from\(\"orders\"\)|\.limit\(5000\)|\.limit\(4000\)|\.limit\(2000\)/, "Reports UI must not bulk-load or browser-filter raw ledgers");
assert.doesNotMatch(legacyPanel, /\.from\(\"payments\"\)|\.from\(\"orders\"\)/, "legacy fixture panel must also stay free of raw ledger loading");

assert.match(page, /Report period/, "Reports must expose a date-range filter");
assert.match(page, /Report order status/, "Reports must expose a status filter");
assert.match(page, /Customer<input/, "Reports must expose a customer filter");
assert.match(page, /Route<input/, "Reports must expose a route filter");
assert.match(page, /CSV current page/, "CSV export must explicitly identify page-only semantics");
assert.match(page, /Excel current page/, "Excel export must explicitly identify page-only semantics");
assert.match(page, /requestSequence/, "Reports must ignore stale async responses");
assert.match(page, /realtimeTimer/, "Reports realtime refresh must be coalesced");
assert.match(page, /loadRef\.current/, "Reports realtime subscription must use the latest load without resubscribing on every filter change");

assert.match(v2Migration, /security invoker/i, "Reports V2 RPC must remain SECURITY INVOKER");
assert.match(v2Migration, /private\.is_admin_or_ceo\(\)/, "Reports V2 RPC must enforce Admin\/CEO authorization");
assert.match(v2Migration, /Africa\/Addis_Ababa/, "Reports V2 date ranges must use Ethiopia local-day boundaries");
assert.match(v2Migration, /p_status text default null/);
assert.match(v2Migration, /p_customer text default null/);
assert.match(v2Migration, /p_route text default null/);
assert.match(v2Migration, /offset \(v_page - 1\) \* v_page_size/);
assert.match(v2Migration, /limit v_page_size/);
assert.match(v2Migration, /revoke all on function public\.admin_reports_v2[\s\S]*from public, anon/i);
assert.match(v2Migration, /grant execute on function public\.admin_reports_v2[\s\S]*to authenticated/i);
assert.doesNotMatch(v2Migration, /\b(update|delete from|insert into)\s+public\./i, "Reports migration must not mutate business rows");

assert.match(legacyMigration, /private\.is_admin_or_ceo\(\)/, "legacy summary RPC authorization remains intact");
assert.match(marker, /^\d{14}$/, "production migration marker must remain a valid timestamp version");
assert.ok(marker >= reportsV2MigrationVersion, "production migration marker must include the applied Reports V2 migration or a newer production migration");

console.log("Admin Reports V2 DB-side filter/pagination regression: PASS");
