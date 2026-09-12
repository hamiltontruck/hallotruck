import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync("src/App.tsx", "utf8");
const page = fs.readFileSync("src/pages/AdminOrderControlQueue.tsx", "utf8");
const paymentWorkspace = fs.readFileSync("src/pages/AdminPaymentWorkspace.tsx", "utf8");
const ceoPage = fs.readFileSync("src/pages/AdminCeoOverview.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-order-control-queue.service.ts", "utf8");
const controlService = fs.readFileSync("src/services/admin-control-center.service.ts", "utf8");
const adminService = fs.readFileSync("src/services/admin.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911232422_admin_order_control_queue_pagination.sql", "utf8");
const unreportedMigration = fs.readFileSync("supabase/migrations/20260912211043_admin_unreported_delivery_payment_page.sql", "utf8");
const searchFixMigration = fs.readFileSync("supabase/migrations/20260912211728_fix_admin_unreported_delivery_payment_search_consistency.sql", "utf8");
const marker = fs.readFileSync("supabase/production-migration-version.txt", "utf8").trim();

assert.ok(app.includes('path="/admin/order-queue"'), "Dedicated Admin control queue route must exist.");
assert.ok(app.includes('/admin/order-queue${search}'), "Legacy Orders queue routing must redirect to the dedicated queue page.");
for (const token of ["getAdminOrderControlQueuePage", "50 rows", "100 rows", "statusCounts", "unreported-payment", "driver_trip_payment_results", "realtimeTimer", "loadRef.current", "requestSequence"]) {
  assert.ok(page.includes(token), `Admin order queue regression token missing: ${token}`);
}
for (const token of ['supabase.rpc("admin_order_control_queue_page"', 'supabase.rpc("admin_unreported_delivery_payment_page"', "p_page_size: pageSize", "p_search: options.search", "p_today: options.today === true"]) {
  assert.ok(service.includes(token), `Admin order queue service token missing: ${token}`);
}
assert.doesNotMatch(service, /\.from\("orders"\)/);
assert.doesNotMatch(service, /\.from\("payments"\)/);
assert.doesNotMatch(service, /\.from\("delivery_proofs"\)/);
assert.match(migration, /security invoker/i);
assert.match(migration, /private\.is_admin_or_ceo\(\)/);
assert.match(migration, /revoke all on function public\.admin_order_control_queue_page[\s\S]*from public/i);
assert.match(migration, /revoke all on function public\.admin_order_control_queue_page[\s\S]*from anon/i);
assert.ok(migration.includes("limit v_page_size"));
assert.ok(migration.includes("offset (v_page - 1) * v_page_size"));
assert.ok(migration.includes("Africa/Addis_Ababa"));

assert.match(unreportedMigration, /security invoker/i);
assert.match(unreportedMigration, /private\.is_admin_or_ceo\(\)/);
for (const token of ["driver_trip_payment_results", "limit v_page_size", "offset (v_page - 1) * v_page_size", "Africa/Addis_Ababa"]) assert.ok(unreportedMigration.includes(token), `Unreported queue migration token missing: ${token}`);
assert.match(unreportedMigration, /revoke all on function public\.admin_unreported_delivery_payment_page[\s\S]*from public, anon/i);
assert.match(unreportedMigration, /grant execute on function public\.admin_unreported_delivery_payment_page[\s\S]*to authenticated/i);
assert.doesNotMatch(unreportedMigration, /\b(update|delete from|insert into)\s+public\./i, "unreported-payment queue migration must not mutate business rows");

for (const token of [
  "v_search text := nullif(btrim(coalesce(p_search, '')), '')",
  "left join public.profiles pr on pr.id = o.driver_id",
  "left join public.trucks t on t.id = o.truck_id",
  "pr.full_name, pr.phone, t.plate_number",
  "limit v_page_size",
  "offset (v_page - 1) * v_page_size",
]) assert.ok(searchFixMigration.includes(token), `Search-consistency migration token missing: ${token}`);
assert.match(searchFixMigration, /revoke all on function public\.admin_unreported_delivery_payment_page[\s\S]*from public, anon/i);
assert.doesNotMatch(searchFixMigration, /\b(update|delete from|insert into)\s+public\./i, "search consistency migration must remain reporting-only");

assert.ok(paymentWorkspace.includes("getAdminOrderControlQueuePage"));
assert.ok(paymentWorkspace.includes('queue: "unreported-payment"'));
assert.doesNotMatch(paymentWorkspace, /\.limit\(200\)/, "payment workspace must never return to the 200-order browser preload");
assert.doesNotMatch(paymentWorkspace, /\.from\("orders"\)|\.from\("driver_trip_payment_results"\)|\.from\("profiles"\)/, "payment workspace must not browser-preload the unreported queue");
assert.ok(controlService.includes("admin_unreported_delivery_payment_page"));
assert.ok(controlService.includes("slice(0, 6)"));
for (const token of ["Driver Payment Reports", "unreportedInvoiceTotal", "driver-payment-report-queue", "realtimeTimer", "driver_verification_files"]) assert.ok(ceoPage.includes(token), `CEO queue token missing: ${token}`);
assert.ok(!ceoPage.includes('table: "driver_documents"'));

assert.ok(/^\d{14}$/.test(marker), "production migration marker must be a 14-digit timestamp");
assert.ok(marker >= "20260912211728", "production migration marker must include the applied search-consistency migration");
assert.doesNotMatch(adminService, /shouldLoadAllOrdersForControlQueue/);

console.log("Admin order/control-center queue regression checks passed.");
