import fs from "node:fs";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");

const checks = [
  [service.includes("ADMIN_DASHBOARD_ORDER_PREVIEW_LIMIT = 100"), "dashboard order preview is bounded"],
  [!service.includes("shouldLoadAllOrdersForControlQueue"), "legacy special-queue load-all fallback is removed"],
  [!service.includes("shouldLoadFullFinanceWorkspace"), "legacy Reports load-all fallback is removed"],
  [service.includes("ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT = 100"), "dashboard reference previews are bounded"],
  [service.includes('.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,created_at").order("created_at", { ascending: false }).limit(ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT)'), "truck reference preview is bounded"],
  [service.includes('.from("customers").select("id,full_name,phone,email,company_name,is_credit_customer,created_at").order("created_at", { ascending: false }).limit(ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT)'), "customer reference preview is bounded"],
  [service.includes('.eq("role", "driver").order("full_name").limit(ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT)'), "driver reference preview is bounded"],
  [service.includes('.select("id", { count: "exact", head: true })'), "dashboard metrics use exact database counts"],
  [service.includes("availableTrucks: availableTrucksResult.count ?? 0"), "available truck metric is independent of preview rows"],
  [service.includes("totalCustomers: totalCustomersResult.count ?? 0"), "customer metric is independent of preview rows"],
  [service.includes("totalOrders: totalOrdersResult.count ?? 0"), "total orders metric is independent of preview rows"],
  [service.includes("activeOrders: activeOrdersResult.count ?? 0"), "active orders metric is independent of preview rows"],
  [service.includes("deliveredOrders: deliveredOrdersResult.count ?? 0"), "delivered orders metric is independent of preview rows"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
