import fs from "node:fs";

const service = fs.readFileSync("src/services/admin-orders.service.ts", "utf8");
const page = fs.readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911_admin_orders_pagination_indexes.sql", "utf8");

const checks = [
  [service.includes("ADMIN_ORDER_PAGE_SIZES = [50, 100]"), "service exposes 50/100 page sizes"],
  [service.includes('.select(ORDER_COLUMNS, { count: "exact" })'), "orders query requests exact filtered count"],
  [service.includes("range(from, to)"), "orders query uses server-side range pagination"],
  [service.includes("tracking_id.ilike") && service.includes("customer_name.ilike") && service.includes("customer_phone.ilike"), "search runs in Supabase query"],
  [service.includes('"quoted"'), "quoted status is supported"],
  [page.includes("getAdminOrdersPage"), "SmartLogistics uses paginated order service"],
  [page.includes('aria-label="Orders per page"'), "Orders UI exposes page-size control"],
  [page.includes("<Pagination"), "Orders UI renders pagination controls"],
  [migration.includes("orders_created_at_desc_idx"), "created_at pagination index is present"],
  [migration.includes("gin_trgm_ops"), "trigram search indexes are present"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);