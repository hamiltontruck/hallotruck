import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminService = readFileSync("src/services/admin.service.ts", "utf8");
const ordersService = readFileSync("src/services/admin-orders.service.ts", "utf8");
const queueService = readFileSync("src/services/admin-order-control-queue.service.ts", "utf8");
const queuePage = readFileSync("src/pages/AdminOrderControlQueue.tsx", "utf8");

test("AdminOrder exposes the authoritative customer service date", () => {
  assert.match(adminService, /service_date:\s*string\s*\|\s*null/);
});

test("admin order services preserve service_date returned by PostgreSQL", () => {
  assert.match(ordersService, /service_date:\s*row\.service_date/);
  assert.match(queueService, /service_date:\s*row\.service_date/);
});

test("Admin Order Control Queue visibly labels Order Date from service_date", () => {
  assert.match(queuePage, /Order Date/);
  assert.match(queuePage, /order\.service_date/);
});
