import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");

test("Admin dashboard bounds normal order preload", () => {
  assert.match(service, /ADMIN_DASHBOARD_ORDER_PREVIEW_LIMIT = 100/);
  assert.match(service, /baseOrdersQuery\.limit\(ADMIN_DASHBOARD_ORDER_PREVIEW_LIMIT\)/);
});

test("Admin dashboard KPIs use exact database counts", () => {
  assert.match(service, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(service, /totalOrders: totalOrdersResult\.count \?\? 0/);
  assert.match(service, /activeOrders: activeOrdersResult\.count \?\? 0/);
  assert.match(service, /deliveredOrders: deliveredOrdersResult\.count \?\? 0/);
});

test("Admin control queues preserve the existing full-order fallback", () => {
  assert.match(service, /shouldLoadAllOrdersForControlQueue/);
  assert.match(service, /queue && queue !== "all"/);
});
