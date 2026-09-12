import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync("src/App.tsx", "utf8");
const page = fs.readFileSync("src/pages/AdminOrderControlQueue.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-order-control-queue.service.ts", "utf8");
const adminService = fs.readFileSync("src/services/admin.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911232422_admin_order_control_queue_pagination.sql", "utf8");
const marker = fs.readFileSync("supabase/production-migration-version.txt", "utf8").trim();

assert.match(app, /section==="Orders"&&queue&&queue!=="all"/);
assert.match(app, /Navigate to=\{`\/admin\/order-queue\$\{search\}`\}/);
assert.match(app, /path="\/admin\/order-queue"/);
assert.match(page, /getAdminOrderControlQueuePage/);
assert.match(page, /50 rows/);
assert.match(page, /100 rows/);
assert.match(page, /statusCounts/);
assert.match(service, /supabase\.rpc\("admin_order_control_queue_page"/);
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
assert.ok(/^\d{14}$/.test(marker), "production migration marker must be a 14-digit timestamp");
assert.ok(marker >= "20260911232422", "production migration marker must include the applied control-queue migration");

// Dedicated queue routing is now authoritative. The legacy load-all helper must stay removed
// so future changes cannot silently reintroduce a full Orders preload behind the paginated route.
assert.doesNotMatch(adminService, /shouldLoadAllOrdersForControlQueue/);

console.log("Admin order control queue pagination regression checks passed.");
