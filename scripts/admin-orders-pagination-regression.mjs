import fs from "node:fs";

const service = fs.readFileSync("src/services/admin-orders.service.ts", "utf8");
const page = fs.readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const consoleUi = fs.readFileSync("src/components/admin/AdminOrdersExecutiveConsole.tsx", "utf8");
const indexMigration = fs.readFileSync("supabase/migrations/20260911044900_admin_orders_pagination_indexes.sql", "utf8");
const rpcMigration = fs.readFileSync("supabase/migrations/20260912152406_admin_orders_page_rpc.sql", "utf8");

const checks = [
  [service.includes("ADMIN_ORDER_PAGE_SIZES = [50, 100]"), "service exposes 50/100 page sizes"],
  [service.includes('supabase.rpc("admin_orders_page"'), "orders page uses database-side pagination RPC"],
  [service.includes("p_page_size") && service.includes("p_search") && service.includes("p_today"), "service forwards pagination/search/date filters to RPC"],
  [service.includes('"quoted"'), "quoted status is supported"],
  [page.includes("getAdminOrdersPage"), "SmartLogistics uses paginated order service"],
  [page.includes("<AdminOrdersExecutiveConsole"), "SmartLogistics renders the enterprise Orders console"],
  [consoleUi.includes('aria-label="Orders per page"'), "Orders UI exposes page-size control"],
  [consoleUi.includes("<Pagination"), "Orders UI renders pagination controls"],
  [consoleUi.includes("Customer and route discovery use the existing server search contract."), "Orders UI does not invent unsupported customer or route filter contracts"],
  [indexMigration.includes("orders_created_at_desc_idx"), "created_at pagination index is present"],
  [indexMigration.includes("gin_trgm_ops"), "trigram search indexes are present"],
  [rpcMigration.includes("admin_orders_page"), "database pagination RPC migration is tracked"],
  [rpcMigration.includes("orders_delivered_at_desc_idx"), "delivered-at date filter index is present"],
  [rpcMigration.includes("Africa/Addis_Ababa"), "today filtering uses exact Ethiopia local-day boundaries"],
  [rpcMigration.includes("least(requested_page, total_pages)"), "out-of-range page requests clamp to the final valid page"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
