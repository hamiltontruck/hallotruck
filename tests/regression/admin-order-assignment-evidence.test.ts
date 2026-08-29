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
