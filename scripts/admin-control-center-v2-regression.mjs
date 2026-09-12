import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [service, page, migration, enumHotfix, unreportedMigration] = await Promise.all([
  readFile("src/services/admin-control-center.service.ts", "utf8"),
  readFile("src/pages/AdminCeoOverview.tsx", "utf8"),
  readFile("supabase/migrations/20260911144710_admin_control_center_v2_report.sql", "utf8"),
  readFile("supabase/migrations/20260912032500_fix_admin_control_center_driver_status_enum.sql", "utf8"),
  readFile("supabase/migrations/20260912211043_admin_unreported_delivery_payment_page.sql", "utf8"),
]);

assert.match(service, /supabase\.rpc\("admin_control_center_v2_report"\)/, "Control Center must load through the DB report RPC.");
assert.match(service, /supabase\.rpc\("admin_unreported_delivery_payment_page"/, "Control Center must load the delivered-but-unreported queue through its bounded server RPC.");
assert.match(service, /slice\(0, 6\)/, "Control Center must keep the unreported-payment action preview bounded to six rows.");
assert.doesNotMatch(service, /\.from\("orders"\)/, "Control Center must not preload orders directly.");
assert.doesNotMatch(service, /\.from\("payments"\)/, "Control Center must not preload payments directly.");
assert.doesNotMatch(service, /\.from\("delivery_proofs"\)/, "Control Center must not preload delivery proofs directly.");
assert.doesNotMatch(service, /\.from\("driver_verification_files"\)/, "Control Center must not preload verification documents directly.");
assert.doesNotMatch(service, /driver_financial_summary/, "Control Center must not perform per-driver finance RPC calls.");
assert.doesNotMatch(service, /\.limit\((?:200|2000|4000)\)/, "Legacy Control Center/browser bulk limits must not return.");

assert.match(page, /data\.serverSummary \?\? fixtureSummary/, "Live KPI values must prefer exact server summary data while fixtures remain supported.");
assert.match(page, /summary\.totalOrders/, "Total Orders must use the exact server count.");
assert.match(page, /summary\.canonicalPayments/, "Header payment count must use the server canonical count.");
assert.match(page, /summary\.commissionReceivable/, "Commission receivable must use server aggregation.");
assert.match(page, /summary\.complianceDocumentAlerts/, "Compliance sub-counts must use exact server counts.");
assert.match(page, /summary\.unreportedPaymentReports/, "CEO Overview must surface exact delivered-but-unreported driver payment count.");
assert.match(page, /summary\.unreportedInvoiceTotal/, "CEO Overview must surface exact unreported invoice total.");
assert.match(page, /driver-payment-report-queue/, "CEO Overview must expose the unreported driver-payment action queue.");
assert.match(page, /admin-ceo-control-center-live/, "CEO Overview must keep one stable realtime channel.");
assert.match(page, /realtimeTimer/, "CEO Overview realtime bursts must be coalesced.");
assert.match(page, /loadRef\.current/, "CEO Overview realtime must invoke the latest load without rebuilding subscriptions.");
assert.match(page, /requestSequence/, "CEO Overview must ignore stale async report responses.");

assert.match(migration, /create or replace function public\.admin_control_center_v2_report\(\)/i);
assert.match(migration, /security invoker/i);
assert.match(migration, /private\.is_admin_or_ceo\(\)/i);
assert.match(migration, /revoke all on function public\.admin_control_center_v2_report\(\) from public, anon/i);
assert.match(migration, /grant execute on function public\.admin_control_center_v2_report\(\) to authenticated/i);
assert.match(migration, /timezone\('Africa\/Addis_Ababa', now\(\)\)/i, "Today metrics must use Ethiopia-local day boundaries.");
assert.match(migration, /limit 6/i, "Action queue previews must stay bounded.");
assert.doesNotMatch(migration, /limit\s+(?:2000|4000)/i, "DB reporting must not preserve legacy bulk caps.");

assert.match(unreportedMigration, /security invoker/i);
assert.match(unreportedMigration, /private\.is_admin_or_ceo\(\)/i);
assert.match(unreportedMigration, /2026-08-28T18:15:40\.000Z/i, "Unreported-payment queue must retain the trip-payment enforcement boundary.");
assert.match(unreportedMigration, /revoke all on function public\.admin_unreported_delivery_payment_page[\s\S]*from public, anon/i);
assert.match(unreportedMigration, /grant execute on function public\.admin_unreported_delivery_payment_page[\s\S]*to authenticated/i);
assert.doesNotMatch(unreportedMigration, /\b(update|delete from|insert into)\s+public\./i, "Unreported-payment reporting migration must not mutate business rows.");

assert.match(enumHotfix, /coalesce\(p\.driver_status::text, ''''\)/i, "Admin Overview must cast driver_status enum to text before empty-string fallback.");
assert.match(enumHotfix, /pg_get_functiondef\('public\.admin_control_center_v2_report\(\)'::regprocedure\)/i, "Enum hotfix must patch only the existing reporting function definition.");
assert.match(enumHotfix, /revoke all on function public\.admin_control_center_v2_report\(\) from public, anon/i);
assert.match(enumHotfix, /grant execute on function public\.admin_control_center_v2_report\(\) to authenticated/i);

console.log("Admin Control Center V2 DB reporting regression guard passed.");
