import fs from "node:fs";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");
const ordersService = fs.readFileSync("src/services/admin-orders.service.ts", "utf8");

const checks = [
  [service.includes("ADMIN_DASHBOARD_ORDER_PREVIEW_LIMIT = 100"), "dashboard order preview remains bounded outside normal Orders"],
  [service.includes("function shouldLoadDashboardOrderPreview()"), "dashboard decides whether an order preview is needed"],
  [service.includes('section === "Orders" && queue === "all"'), "normal Orders queue is detected explicitly"],
  [service.includes('Promise.resolve({ data: [] as DashboardOrderPreviewRow[], error: null })'), "normal Orders skips dashboard order row fetch entirely"],
  [service.includes('const queue = params.get("queue") ?? "all"'), "special queue routing preserves its existing preview fallback"],
  [!service.includes("shouldLoadAllOrdersForControlQueue"), "legacy unbounded special-queue load-all fallback is absent"],
  [!service.includes("shouldLoadFullFinanceWorkspace"), "legacy Reports load-all fallback is absent"],
  [service.includes("ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT = 100"), "dashboard reference previews are bounded"],
  [service.includes('.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,created_at").order("created_at", { ascending: false }).limit(ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT)'), "truck reference preview is bounded"],
  [service.includes('.from("customers").select("id,full_name,phone,email,company_name,is_credit_customer,created_at").order("created_at", { ascending: false }).limit(ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT)'), "customer reference preview is bounded"],
  [service.includes('.eq("role", "driver").order("full_name").limit(ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT)'), "driver reference preview is bounded"],
  [service.includes('.select("id", { count: "exact", head: true })'), "dashboard metrics use exact database counts"],
  [service.includes("totalOrders: totalOrdersResult.count ?? 0"), "total orders metric is independent of preview rows"],
  [service.includes("activeOrders: activeOrdersResult.count ?? 0"), "active orders metric is independent of preview rows"],
  [service.includes("deliveredOrders: deliveredOrdersResult.count ?? 0"), "delivered orders metric is independent of preview rows"],
  [ordersService.includes('supabase.rpc("admin_orders_page"'), "normal Orders rows come from the paginated database service"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
