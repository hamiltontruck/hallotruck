import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
const migration = await readFile(path.join(process.cwd(), "supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql"), "utf8");
const customer = await readFile(path.join(process.cwd(), "src/pages/CustomerPortal.tsx"), "utf8");
const driver = await readFile(path.join(process.cwd(), "src/pages/DriverPaymentCollection.tsx"), "utf8");
const rating = await readFile(path.join(process.cwd(), "src/components/customer/CustomerRatingCard.tsx"), "utf8");
test("simplified workflow preserves assignment and duplicate safety", () => { assert.match(migration,/database-assigned driver|v_driver is distinct from v_actor/); assert.match(migration,/Payment result already confirmed/); assert.match(migration,/payment_not_received/); });
test("cash commission consumes deposit while bank leaves deposit unchanged", () => { assert.ok(migration.includes("v_commission:=round(v_total*0.02,2)")); assert.match(migration,/deposit_consumed_etb/); assert.match(migration,/bank_telebirr'[\s\S]*v_deposit,0,v_deposit,0/); });
test("customer receipt flow is removed and payment method is selected", () => { assert.doesNotMatch(customer,/CustomerPaymentModal/); assert.match(customer,/Bank \/ Telebirr/); assert.match(customer,/No receipt or screenshot/); });
test("driver records all three payment outcomes", () => { assert.match(driver,/cash_received/); assert.match(driver,/bank_telebirr/); assert.match(driver,/payment_not_received/); assert.match(driver,/Exact amount collected/); });
test("rating is optional and duplicate ratings are insert-only", () => { assert.match(rating,/Skip|Darbii|ዝለል/); assert.match(migration,/already rated/); assert.doesNotMatch(migration,/on conflict (order_id) do update/); });

test("bank commission remains reportable without consuming the driver deposit", () => {
  assert.match(migration, /driver_cash_commission_liability_total/);
  assert.match(migration, /private\.driver_commission_charged_total\(p_driver_id\) all_charged/);
  assert.match(migration, /trip_completed_bank_telebirr[\s\S]*deposit_consumed_etb',0/);
});
test("Admin and CEO reconciliation exposes every required completion field", () => {
  assert.match(migration, /admin_customer_driver_reconciliation/);
  for (const field of ["cash_collected_etb", "bank_telebirr_received_etb", "hallo_commission_etb", "driver_gross_etb", "driver_net_etb", "deposit_consumed_etb", "remaining_available_deposit_etb", "commission_due_etb", "rating_status"]) assert.ok(migration.includes(field), field);
});
test("completion payment and commission events are appended to the audit log", () => {
  assert.match(migration, /driver_commission_audit/);
  assert.match(migration, /trip_completed_cash_received/);
  assert.match(migration, /trip_completed_payment_outstanding/);
});
