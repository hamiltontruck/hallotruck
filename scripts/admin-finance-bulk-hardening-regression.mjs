import fs from "node:fs";
import assert from "node:assert/strict";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");
const operations = fs.readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const paymentService = fs.readFileSync("src/services/admin-payments.service.ts", "utf8");
const ledger = fs.readFileSync("src/components/admin/AdminPaymentLedgerPanel.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911022227_admin_finance_aggregation_hardening.sql", "utf8");

assert.doesNotMatch(service, /ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT/, "Admin shell must not carry a finance preview limit because it must not preload payment/proof rows");
assert.doesNotMatch(service, /from\("payments"\)/, "Admin shell must not preload payment rows");
assert.doesNotMatch(service, /from\("delivery_proofs"\)/, "Admin shell must not preload delivery proof rows");
assert.match(service, /payments: \[\] as Payment\[\]/, "Admin shell returns no hidden payment preview");
assert.match(service, /deliveryProofs: \[\] as DeliveryProof\[\]/, "Admin shell returns no hidden proof preview");
assert.match(service, /supabase\.rpc\("admin_finance_dashboard_summary"\)/, "dashboard revenue still uses DB aggregation");
assert.match(service, /financeSummary\?\.released_total_etb/);
assert.match(service, /financeSummary\?\.refunded_total_etb/);

assert.match(paymentService, /supabase\.rpc\("admin_payment_ledger_page"\)/, "Finance ledger remains server-paginated");
assert.match(paymentService, /supabase\.rpc\("admin_finance_dashboard_summary"\)/, "Finance summary remains database-aggregated");
assert.match(paymentService, /getAdminOrderFinancialDetails/, "order-specific finance details have a dedicated lazy loader");
assert.match(paymentService, /\.eq\("order_id", orderId\)/, "lazy finance/proof details are scoped to one order");
assert.match(operations, /function LazyManageOrderModal/);
assert.match(operations, /getAdminOrderFinancialDetails\(order\.id\)/, "Manage Order loads payment/proof details only after the order is opened");
assert.match(ledger, /getAdminPaymentLedgerPage/);
assert.match(ledger, /getAdminOrderFinancialDetails\(payment\.order_id\)/, "Finance evidence expansion remains lazy per order");

assert.match(migration, /security invoker/i);
assert.match(migration, /private\.is_admin_or_ceo\(\)/);

console.log("Admin finance no-bulk-preload and lazy order detail regression checks passed.");
