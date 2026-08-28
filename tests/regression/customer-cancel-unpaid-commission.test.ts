import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20260829013000_lock_customer_cancel_and_charge_unpaid_commission.sql"), "utf8");
const ui = await readFile(path.join(process.cwd(), "src/components/customer/CustomerCancelOrderModal.tsx"), "utf8");

test("active orders cannot be cancelled by the Customer", () => {
  assert.match(sql, /v_driver_id is not null/);
  assert.match(sql, /'quoted'::public\.order_status, 'placed'::public\.order_status/);
  assert.match(ui, /cancellationLocked/);
  assert.match(ui, /\["quoted", "placed"\]/);
});

test("unpaid completion records a two percent commission", () => {
  assert.match(sql, /payment_not_received/);
  assert.match(sql, /v_trip_amount \* 0\.02/);
  assert.match(sql, /new\.commission_etb := v_commission/);
  assert.match(sql, /new\.driver_net_etb := v_trip_amount - v_commission/);
});

test("unpaid commission updates deposit and due snapshots", () => {
  assert.match(sql, /least\(v_available_before, v_commission\)/);
  assert.match(sql, /greatest\(0, v_available_before - v_commission\)/);
  assert.match(sql, /greatest\(0, v_commission - v_available_before\)/);
});

test("later positive payment prevents commission duplication", () => {
  const guards = sql.match(/positive_result\.result_type in \('cash_received', 'bank_telebirr'\)/g) ?? [];
  assert.equal(guards.length, 2);
});

test("unpaid commission has an audit event and creates no payment row", () => {
  assert.match(sql, /trip_completed_unpaid_commission_accrued/);
  assert.doesNotMatch(sql, /insert into public\.payments/);
});
