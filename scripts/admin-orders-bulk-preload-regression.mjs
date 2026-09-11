import fs from "node:fs";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");

const checks = [
  [service.includes("ADMIN_DASHBOARD_ORDER_PREVIEW_LIMIT = 100"), "dashboard order preview is bounded"],
  [service.includes("shouldLoadAllOrdersForControlQueue"), "special control queues preserve full-order fallback"],
  [service.includes('.select("id", { count: "exact", head: true })'), "dashboard metrics use exact database counts"],
  [service.includes("totalOrders: totalOrdersResult.count ?? 0"), "total orders metric is independent of preview rows"],
  [service.includes("activeOrders: activeOrdersResult.count ?? 0"), "active orders metric is independent of preview rows"],
  [service.includes("deliveredOrders: deliveredOrdersResult.count ?? 0"), "delivered orders metric is independent of preview rows"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
