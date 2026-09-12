import fs from "node:fs";
import assert from "node:assert/strict";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");
const operations = fs.readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const paymentService = fs.readFileSync("src/services/admin-payments.service.ts", "utf8");
const ledger = fs.readFileSync("src/components/admin/AdminPaymentLedgerPanel.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911022227_admin_finance_aggregation_hardening.sql", "utf8");

assert.ok(!service.includes("ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT"), "Admin shell must not carry a finance preview limit because it must not preload payment/proof rows");
assert.ok(!service.includes('.from("payments")'), "Admin shell must not preload payment rows");
assert.ok(!service.includes('.from("delivery_proofs")'), "Admin shell must not preload delivery proof rows");
assert.ok(service.includes("payments: [] as Payment[]"), "Admin shell returns no hidden payment preview");
assert.ok(service.includes("deliveryProofs: [] as DeliveryProof[]"), "Admin shell returns no hidden proof preview");
assert.ok(service.includes('supabase.rpc("admin_finance_dashboard_summary")'), "dashboard revenue still uses DB aggregation");
assert.ok(service.includes("financeSummary?.released_total_etb"));
assert.ok(service.includes("financeSummary?.refunded_total_etb"));

assert.ok(paymentService.includes('supabase.rpc("admin_payment_ledger_page"'), "Finance ledger remains server-paginated");
assert.ok(paymentService.includes('supabase.rpc("admin_finance_dashboard_summary")'), "Finance summary remains database-aggregated");
assert.ok(paymentService.includes("getAdminOrderFinancialDetails"), "order-specific finance details have a dedicated lazy loader");
assert.ok(paymentService.includes('.eq("order_id", orderId)'), "lazy finance/proof details are scoped to one order");
assert.ok(operations.includes("function LazyManageOrderModal"));
assert.ok(operations.includes("getAdminOrderFinancialDetails(order.id)"), "Manage Order loads payment/proof details only after the order is opened");
assert.ok(ledger.includes("getAdminPaymentLedgerPage"));
assert.ok(ledger.includes("getAdminOrderFinancialDetails(payment.order_id)"), "Finance evidence expansion remains lazy per order");

assert.ok(migration.toLowerCase().includes("security invoker"));
assert.ok(migration.includes("private.is_admin_or_ceo()"));

console.log("Admin finance no-bulk-preload and lazy order detail regression checks passed.");
