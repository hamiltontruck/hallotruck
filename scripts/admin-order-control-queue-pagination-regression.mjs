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

assert.match(app, /section==="Orders"&&queue&&queue!=="all"/);
assert.match(app, /Navigate to=\{`\/admin\/order-queue\$\{search\}`\}/);
assert.match(app, /path="\/admin\/order-queue"/);
assert.match(page, /getAdminOrderControlQueuePage/);
assert.match(page, /50 rows/);
assert.match(page, /100 rows/);
assert.match(page, /statusCounts/);
assert.match(page, /unreported-payment/);
assert.match(page, /driver_trip_payment_results/);
assert.match(page, /realtimeTimer/);
assert.match(service, /supabase\.rpc\("admin_order_control_queue_page"/);
assert.match(service, /supabase\.rpc\("admin_unreported_delivery_payment_page"/);
assert.match(service, /p_page_size: pageSize/);
assert.match(service, /p_search: options\.search/);
assert.match(service, /p_today: options\.today === true/);
assert.doesNotMatch(service, /\.from\("orders"\)/);
assert.doesNotMatch(service, /\.from\("payments"\)/);
assert.doesNotMatch(service, /\.from\("delivery_proofs"\)/);
assert.match(migration, /security invoker/i);
assert.match(migration, /private\.is_admin_or_ceo\(\)/);
assert.match(migration, /revoke all on function public\.admin_order_control_queue_page[\s\S]*from public/i);
assert.match(migration, /revoke all on function public\.admin_order_control_queue_page[\s\S]*from anon/i);
assert.match(migration, /limit v_page_size/i);
assert.match(migration, /offset \(v_page - 1\) \* v_page_size/i);
assert.match(migration, /Africa\/Addis_Ababa/);

assert.match(unreportedMigration, /security invoker/i);
assert.match(unreportedMigration, /private\.is_admin_or_ceo\(\)/);
assert.match(unreportedMigration, /driver_trip_payment_results/);
assert.match(unreportedMigration, /limit v_page_size/i);
assert.match(unreportedMigration, /offset \(v_page - 1\) \* v_page_size/i);
assert.match(unreportedMigration, /Africa\/Addis_Ababa/);
assert.match(unreportedMigration, /revoke all on function public\.admin_unreported_delivery_payment_page[\s\S]*from public, anon/i);
assert.match(unreportedMigration, /grant execute on function public\.admin_unreported_delivery_payment_page[\s\S]*to authenticated/i);
assert.doesNotMatch(unreportedMigration, /\b(update|delete from|insert into)\s+public\./i, "unreported-payment queue migration must not mutate business rows");

assert.match(searchFixMigration, /v_search text := nullif\(btrim\(coalesce\(p_search, ''\)\), ''\)/);
assert.match(searchFixMigration, /left join public\.profiles pr on pr\.id = o\.driver_id/);
assert.match(searchFixMigration, /left join public\.trucks t on t\.id = o\.truck_id/);
assert.match(searchFixMigration, /pr\.full_name, pr\.phone, t\.plate_number/);
assert.match(searchFixMigration, /limit v_page_size/i);
assert.match(searchFixMigration, /offset \(v_page - 1\) \* v_page_size/i);
assert.match(searchFixMigration, /revoke all on function public\.admin_unreported_delivery_payment_page[\s\S]*from public, anon/i);
assert.doesNotMatch(searchFixMigration, /\b(update|delete from|insert into)\s+public\./i, "search consistency migration must remain reporting-only");

assert.match(paymentWorkspace, /getAdminOrderControlQueuePage/);
assert.match(paymentWorkspace, /queue: "unreported-payment"/);
assert.doesNotMatch(paymentWorkspace, /\.limit\(200\)/, "payment workspace must never return to the 200-order browser preload");
assert.doesNotMatch(paymentWorkspace, /\.from\("orders"\)|\.from\("driver_trip_payment_results"\)|\.from\("profiles"\)/, "payment workspace must not browser-preload the unreported queue");
assert.match(controlService, /admin_unreported_delivery_payment_page/);
assert.match(controlService, /slice\(0, 6\)/);
assert.match(ceoPage, /Driver Payment Reports/);
assert.match(ceoPage, /unreportedInvoiceTotal/);
assert.match(ceoPage, /driver-payment-report-queue/);
assert.match(ceoPage, /realtimeTimer/);
assert.match(ceoPage, /driver_verification_files/);
assert.doesNotMatch(ceoPage, /table: "driver_documents"/);

assert.ok(/^\d{14}$/.test(marker), "production migration marker must be a 14-digit timestamp");
assert.ok(marker >= "20260912211728", "production migration marker must include the applied search-consistency migration");

// Dedicated queue routing is authoritative. Legacy load-all helpers must stay removed
// so future changes cannot silently reintroduce full Orders/payment-history preloads.
assert.doesNotMatch(adminService, /shouldLoadAllOrdersForControlQueue/);

console.log("Admin order/control-center queue regression checks passed.");
