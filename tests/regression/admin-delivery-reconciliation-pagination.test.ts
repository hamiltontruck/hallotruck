import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const panel = fs.readFileSync("src/components/admin/AdminDeliveryReconciliationPanel.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-delivery-reconciliation.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911142629_admin_delivery_reconciliation_report.sql", "utf8");
const refinement = fs.readFileSync("supabase/migrations/20260911142733_refine_admin_delivery_reconciliation_report.sql", "utf8");

test("Delivery reconciliation no longer scans a capped client-side order set", () => {
  assert.doesNotMatch(panel, /\.limit\(500\)/);
  assert.doesNotMatch(panel, /\.from\("orders"\)/);
  assert.doesNotMatch(panel, /\.from\("delivery_proofs"\)/);
  assert.doesNotMatch(panel, /QUERY_BATCH_SIZE|Promise\.all\(orderIdBatches/);
  assert.match(panel, /getAdminDeliveryReconciliationReport/);
});

test("Delivery reconciliation uses DB-side 50\/100 pagination and exact summaries", () => {
  assert.match(service, /DELIVERY_RECONCILIATION_PAGE_SIZES = \[50, 100\]/);
  assert.match(service, /admin_delivery_reconciliation_report/);
  assert.match(panel, /Showing .*reconciliation gaps/);
  assert.match(panel, /Page \{report\.page\} \/ \{report\.totalPages\}/);
  assert.match(panel, /Delivered total checked/);
  assert.match(panel, /currentWithoutProof/);
  assert.match(panel, /currentWithoutTripPaymentResult/);
});

test("Delivery reconciliation RPC is leadership guarded and indexed", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /orders_status_delivered_at_desc_idx/);
  assert.match(migration, /driver_trip_payment_results_order_id_idx/);
  assert.match(migration, /offset \(v_page - 1\) \* v_page_size/);
  assert.match(migration, /limit v_page_size/);
  assert.match(migration, /revoke all on function public\.admin_delivery_reconciliation_report[\s\S]*from public, anon/i);
});

test("Delivery reconciliation preserves release boundaries and clamps pages before querying", () => {
  assert.match(refinement, /2026-08-16T18:17:11\.000Z/);
  assert.match(refinement, /2026-08-28T18:15:40\.000Z/);
  assert.match(refinement, /currentWithoutProof/);
  assert.match(refinement, /currentWithoutTripPaymentResult/);
  assert.match(refinement, /v_page := least\(v_page, v_total_pages\)/);
  assert.match(refinement, /offset \(v_page - 1\) \* v_page_size/);
});
