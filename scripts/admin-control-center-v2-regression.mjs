import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [service, page, migration, enumHotfix, unreportedMigration] = await Promise.all([
  readFile("src/services/admin-control-center.service.ts", "utf8"),
  readFile("src/pages/AdminCeoOverview.tsx", "utf8"),
  readFile("supabase/migrations/20260911144710_admin_control_center_v2_report.sql", "utf8"),
  readFile("supabase/migrations/20260912032500_fix_admin_control_center_driver_status_enum.sql", "utf8"),
  readFile("supabase/migrations/20260912211043_admin_unreported_delivery_payment_page.sql", "utf8"),
]);

assert.ok(service.includes('supabase.rpc("admin_control_center_v2_report")'), "Control Center must load through the DB report RPC.");
assert.ok(service.includes('supabase.rpc("admin_unreported_delivery_payment_page"'), "Control Center must load the delivered-but-unreported queue through its bounded server RPC.");
assert.ok(service.includes("slice(0, 6)"), "Control Center must keep the unreported-payment action preview bounded to six rows.");
assert.doesNotMatch(service, /\.from\("orders"\)/, "Control Center must not preload orders directly.");
assert.doesNotMatch(service, /\.from\("payments"\)/, "Control Center must not preload payments directly.");
assert.doesNotMatch(service, /\.from\("delivery_proofs"\)/, "Control Center must not preload delivery proofs directly.");
assert.doesNotMatch(service, /\.from\("driver_verification_files"\)/, "Control Center must not preload verification documents directly.");
assert.doesNotMatch(service, /driver_financial_summary/, "Control Center must not perform per-driver finance RPC calls.");
assert.doesNotMatch(service, /\.limit\((?:200|2000|4000)\)/, "Legacy Control Center/browser bulk limits must not return.");

for (const token of [
  "data.serverSummary ?? fixtureSummary",
  "summary.totalOrders",
  "summary.canonicalPayments",
  "summary.commissionReceivable",
  "summary.complianceDocumentAlerts",
  "summary.unreportedPaymentReports",
  "summary.unreportedInvoiceTotal",
  "driver-payment-report-queue",
  "admin-ceo-control-center-live",
  "realtimeTimer",
  "loadRef.current",
  "requestSequence",
  'table: "driver_verification_files"',
]) assert.ok(page.includes(token), `CEO Control Center regression token missing: ${token}`);
assert.ok(!page.includes('table: "driver_documents"'), "CEO Control Center must not subscribe to the non-production driver_documents table.");

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
assert.ok(unreportedMigration.includes("2026-08-28T18:15:40.000Z"), "Unreported-payment queue must retain the trip-payment enforcement boundary.");
assert.match(unreportedMigration, /revoke all on function public\.admin_unreported_delivery_payment_page[\s\S]*from public, anon/i);
assert.match(unreportedMigration, /grant execute on function public\.admin_unreported_delivery_payment_page[\s\S]*to authenticated/i);
assert.doesNotMatch(unreportedMigration, /\b(update|delete from|insert into)\s+public\./i, "Unreported-payment reporting migration must not mutate business rows.");

assert.match(enumHotfix, /coalesce\(p\.driver_status::text, ''''\)/i, "Admin Overview must cast driver_status enum to text before empty-string fallback.");
assert.match(enumHotfix, /pg_get_functiondef\('public\.admin_control_center_v2_report\(\)'::regprocedure\)/i, "Enum hotfix must patch only the existing reporting function definition.");
assert.match(enumHotfix, /revoke all on function public\.admin_control_center_v2_report\(\) from public, anon/i);
assert.match(enumHotfix, /grant execute on function public\.admin_control_center_v2_report\(\) to authenticated/i);

console.log("Admin Control Center V2 DB reporting regression guard passed.");
