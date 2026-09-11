import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync("src/App.tsx", "utf8");
const page = fs.readFileSync("src/pages/AdminReports.tsx", "utf8");
const panel = fs.readFileSync("src/components/admin/AdminReportsPanel.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-reports.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911195014_admin_reports_db_summary.sql", "utf8");
const marker = fs.readFileSync("supabase/production-migration-version.txt", "utf8").trim();
const reportsMigrationVersion = "20260911195014";

assert.match(app, /section===\"Reports\"\)return <Navigate to=\"\/admin\/reports\" replace \/>/, "legacy Reports must redirect before SmartLogistics mounts");
assert.match(app, /path=\"\/admin\/reports\"/, "DB-backed Admin Reports route must exist");
assert.match(page, /<AdminReportsPanel fallback=\{emptySummary\}/, "Admin Reports page must use the DB-backed panel");
assert.match(panel, /getAdminReportsSummary\(\)/, "Admin Reports panel must request exact server summary values");
assert.match(service, /supabase\.rpc\(\"admin_reports_summary\"\)/, "Reports service must use the reporting RPC");
assert.doesNotMatch(panel, /from\(\"payments\"\)|from\(\"orders\"\)|\.limit\(5000\)|\.limit\(4000\)|\.limit\(2000\)/, "Reports UI must not bulk-load raw ledgers");
assert.match(migration, /security invoker/i, "Reports RPC must remain SECURITY INVOKER");
assert.match(migration, /private\.is_admin_or_ceo\(\)/, "Reports RPC must enforce Admin\/CEO authorization");
assert.match(migration, /revoke execute on function public\.admin_reports_summary\(\) from public/i, "public execution must stay revoked");
assert.match(migration, /revoke execute on function public\.admin_reports_summary\(\) from anon/i, "anon execution must stay revoked");
assert.match(marker, /^\d{14}$/, "production migration marker must remain a valid timestamp version");
assert.ok(marker >= reportsMigrationVersion, "production migration marker must include the applied Reports migration or a newer production migration");

console.log("Admin Reports DB summary regression: PASS");
