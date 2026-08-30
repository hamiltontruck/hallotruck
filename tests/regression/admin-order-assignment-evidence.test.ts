import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const service = await readFile(path.join(process.cwd(), "src/services/admin.service.ts"), "utf8");
const page = await readFile(path.join(process.cwd(), "src/pages/SmartLogistics.tsx"), "utf8");

test("Admin orders expose assigned Driver and truck plate from database IDs", () => {
  assert.match(service, /driver_name: string \| null/);
  assert.match(service, /plate_number: string \| null/);
  assert.match(service, /drivers\.find\(\(item\) => item\.id === order\.driver_id\)/);
  assert.match(service, /trucks\.find\(\(item\) => item\.id === order\.truck_id\)/);
  assert.match(service, /assignment_label: assignmentLabel/);
  assert.match(service, /cargo_description: cargoLabel/);
  assert.match(page, /Driver \/ plate: \{o\.assignment_label/);
  assert.match(page, /Assigned vehicle/);
  assert.match(page, /Plate \{assignedPlate\}/);
});

test("Manage Order removes the obsolete manual payment-entry form at source", () => {
  assert.doesNotMatch(page, /Payment & verification/);
  assert.doesNotMatch(page, /<form onSubmit=\{pay\}/);
  assert.doesNotMatch(page, /async function pay\(/);
  assert.match(page, /Payment evidence/);
});

test("Payment evidence, immutable history and invoice PDF remain visible", () => {
  assert.match(page, /Payment evidence/);
  assert.match(page, /No customer receipt attached/);
  assert.match(page, /Invoice \/ receipt PDF/);
  assert.match(page, /orderPayments\.map/);
});

test("Manage Order exposes Admin-only cancellation without hard deleting finance history", async () => {
  const migration = await readFile(path.join(process.cwd(), "supabase/migrations/20260829162000_admin_cancel_order_control.sql"), "utf8");

  assert.match(service, /adminCancelOrder/);
  assert.match(service, /supabase\.rpc\("admin_cancel_order"/);
  assert.match(page, /Cancel order/);
  assert.match(page, /Payments stay in Finance for refund\/correction review/);
  assert.match(migration, /create or replace function public\.admin_cancel_order/);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /cancellation_source = 'admin'/);
  assert.match(migration, /public\.customer_dispatch_requests/);
  assert.match(migration, /public\.trucks truck[\s\S]*status = 'available'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(orders|payments|driver_commission_charges|driver_payment_confirmations)/i);
});


test("Manage Order permanently deletes only safe cancelled unassigned orders", async () => {
  const migration = await readFile(path.join(process.cwd(), "supabase/migrations/20260830034000_admin_delete_cancelled_unassigned_order.sql"), "utf8");

  assert.match(page, /supabase\.rpc\("admin_delete_cancelled_order"/);
  assert.match(page, /canDeleteOrder=order\.status==="cancelled"&&!order\.driver_id&&!order\.truck_id/);
  assert.match(page, /Delete order/);
  assert.match(page, /Permanently delete order/);
  assert.match(page, /This cannot be undone/);
  assert.match(page, /database will reject this action if any payment, receipt, delivery, commission, settlement, rating or audit history exists/i);
  assert.match(migration, /create or replace function public\.admin_delete_cancelled_order/);
  assert.match(migration, /private\.require_active_leadership/);
  assert.match(migration, /v_status <> 'cancelled'/);
  assert.match(migration, /v_driver_id is not null or v_truck_id is not null/);
  assert.match(migration, /v_accepted_at is not null or v_delivered_at is not null/);
  assert.match(migration, /public\.payments/);
  assert.match(migration, /private\.payment_reference_registry/);
  assert.match(migration, /public\.payment_review_audit/);
  assert.match(migration, /public\.financial_corrections/);
  assert.match(migration, /public\.delivery_proofs/);
  assert.match(migration, /public\.driver_commission_charges/);
  assert.match(migration, /public\.driver_payment_confirmation_events/);
  assert.match(migration, /public\.driver_trip_payment_results/);
  assert.match(migration, /public\.partner_freight_earnings/);
  assert.match(migration, /public\.ratings/);
  assert.match(migration, /public\.notifications/);
  assert.match(migration, /revoke delete, truncate, references, trigger[\s\S]*public\.orders/);
  assert.match(migration, /delete from public\.orders/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(payments|payment_review_audit|financial_corrections|delivery_proofs|driver_commission_charges|driver_payment_confirmations|partner_freight_earnings|ratings)/i);
});
