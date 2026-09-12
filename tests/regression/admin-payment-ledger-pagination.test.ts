import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const service = fs.readFileSync("src/services/admin-payments.service.ts", "utf8");
const panel = fs.readFileSync("src/components/admin/AdminPaymentLedgerPanel.tsx", "utf8");
const page = fs.readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const adminService = fs.readFileSync("src/services/admin.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911024421_admin_payment_ledger_server_pagination.sql", "utf8");

test("Admin Finance uses database-side payment pagination", () => {
  assert.match(service, /ADMIN_PAYMENT_PAGE_SIZES = \[50, 100\]/);
  assert.match(service, /admin_payment_ledger_page/);
  assert.match(service, /admin_finance_dashboard_summary/);
  assert.match(panel, /Payments per page/);
  assert.match(panel, /Payment ledger pagination/);
  assert.match(page, /<AdminPaymentLedgerPanel/);
});

test("Reports and Finance no longer request payment or proof previews through Admin Operations", () => {
  assert.match(app, /if\s*\(section\s*===\s*"Reports"\)\s*return\s*<Navigate\s+to="\/admin\/reports"\s+replace\s*\/>/);
  assert.doesNotMatch(adminService, /shouldLoadFullFinanceWorkspace/);
  assert.doesNotMatch(adminService, /getAdminSearchParams/);
  assert.doesNotMatch(adminService, /section === "Finance" \|\| section === "Reports"/);
  assert.doesNotMatch(adminService, /ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT/);
  assert.doesNotMatch(adminService, /from\("payments"\)/);
  assert.doesNotMatch(adminService, /from\("delivery_proofs"\)/);
  assert.match(adminService, /payments: \[\] as Payment\[\]/);
  assert.match(adminService, /deliveryProofs: \[\] as DeliveryProof\[\]/);
});

test("Payment ledger RPC is leadership guarded and indexed", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /payments_event_created_at_desc_idx/);
  assert.match(migration, /payments_provider_ref_trgm_idx/);
  assert.match(migration, /offset \(v_page - 1\) \* v_page_size/);
  assert.match(migration, /limit v_page_size/);
});

test("Payment ledger does not eagerly re-fetch all page orders", () => {
  assert.doesNotMatch(service, /orderIds\s*=|\.in\("id",\s*orderIds\)/);
  assert.doesNotMatch(service, /ordersResult/);
  assert.match(service, /getAdminPaymentOrder/);
  assert.match(service, /from\("orders"\)\.select\(ORDER_COLUMNS\)\.eq\("id", orderId\)\.maybeSingle\(\)/);
  assert.match(panel, /getAdminPaymentOrder\(payment\.order_id\)/);
  assert.match(panel, /openingOrder/);
});

test("Finance ledger search is debounced and stale responses are ignored", () => {
  assert.match(panel, /debouncedSearchQuery/);
  assert.match(panel, /setTimeout\(\(\) => setDebouncedSearchQuery\(searchQuery\), 300\)/);
  assert.match(panel, /requestSequence/);
  assert.match(panel, /requestId !== requestSequence\.current/);
  assert.match(panel, /search: debouncedSearchQuery/);
});

test("Order-specific finance evidence is lazy loaded", () => {
  assert.match(service, /getAdminOrderFinancialDetails/);
  assert.match(service, /\.eq\("order_id", orderId\)/);
  assert.match(service, /delivery_proofs/);
  assert.match(panel, /getAdminOrderFinancialDetails\(payment\.order_id\)/);
  assert.match(panel, /Payment \/ delivery evidence/);
  assert.match(panel, /View delivery photo/);
  assert.match(panel, /View signature/);
});
