import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildTripCompletionSteps,
  getDriverPostDeliveryRoute,
  type TripCompletionSummary,
} from "../../src/domain/trip-completion";

const root = process.cwd();
const migration = readFileSync(path.join(
  root,
  "supabase/migrations/20260828001008_customer_driver_completion_workflow.sql",
), "utf8");
const deliveryService = readFileSync(path.join(root, "src/services/delivery-proof.service.ts"), "utf8");
const activeTrip = readFileSync(path.join(root, "src/pages/ActiveTrip.tsx"), "utf8");

function summary(overrides: Partial<TripCompletionSummary> = {}): TripCompletionSummary {
  return {
    order_id: "order-1",
    tracking_id: "HT-2026-000001",
    order_status: "delivered",
    payment_terms: "pay_driver_on_delivery",
    invoice_total_etb: 10_000,
    initiated_etb: 0,
    held_escrow_etb: 0,
    released_etb: 0,
    refunded_etb: 0,
    verified_net_etb: 0,
    balance_due_etb: 10_000,
    commission_charged_etb: 0,
    payment_state: "payment_required",
    delivery_proof_recorded: true,
    rating_score: null,
    ...overrides,
  };
}

test("POD completion sends pay-on-delivery drivers directly to collection", () => {
  assert.equal(getDriverPostDeliveryRoute("pay_driver_on_delivery", "order-1"), "/driver/payment/order-1");
  assert.equal(getDriverPostDeliveryRoute("prepaid", "order-1"), "/driver/earnings");
  assert.match(activeTrip, /getDriverPostDeliveryRoute\(order\.payment_terms, order\.id\)/);
});

test("completion steps distinguish unpaid, pending, released commission and rating", () => {
  const unpaid = buildTripCompletionSteps(summary(), "driver");
  assert.deepEqual(unpaid.map((step) => step.state), ["complete", "attention", "waiting", "waiting"]);

  const pending = buildTripCompletionSteps(summary({
    initiated_etb: 10_000,
    payment_state: "awaiting_admin_review",
  }), "driver");
  assert.deepEqual(pending.map((step) => step.state), ["complete", "current", "waiting", "waiting"]);

  const released = buildTripCompletionSteps(summary({
    released_etb: 10_000,
    verified_net_etb: 10_000,
    balance_due_etb: 0,
    commission_charged_etb: 200,
    payment_state: "released",
  }), "driver");
  assert.deepEqual(released.map((step) => step.state), ["complete", "complete", "complete", "current"]);

  const rated = buildTripCompletionSteps(summary({
    released_etb: 10_000,
    verified_net_etb: 10_000,
    balance_due_etb: 0,
    commission_charged_etb: 200,
    payment_state: "released",
    rating_score: 5,
  }), "customer");
  assert.deepEqual(rated.map((step) => step.state), ["complete", "complete", "complete"]);
});

test("completion RPC is participant scoped and correction-aware", () => {
  assert.match(migration, /create or replace function public\.trip_completion_summary/);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /v_actor is distinct from v_customer[\s\S]*v_actor is distinct from v_driver/);
  assert.match(migration, /driver_commission_reversal_etb[\s\S]*financial_corrections correction/);
  assert.match(migration, /case when v_leadership or v_actor = v_driver[\s\S]*else 0/);
  assert.match(migration, /not exists \([\s\S]*driver_payment_confirmations confirmation[\s\S]*confirmation\.payment_id = charge\.payment_id/);
  assert.match(migration, /revoke all on function public\.trip_completion_summary\(uuid\) from public, anon/);
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/);
});

test("POD retry preserves the original proof and avoids duplicate uploads", () => {
  assert.match(migration, /if v_status = 'delivered' and v_existing_proof then[\s\S]*return;/);
  assert.match(migration, /delivery proof cleanup[\s\S]*not exists \([\s\S]*recorded_proof\.photo_path/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(delivery_proofs|payments|driver_commission_charges|ratings)/i);
  assert.match(deliveryService, /from\("delivery_proofs"\)[\s\S]*maybeSingle\(\)/);
  assert.match(deliveryService, /recorded\.data\.photo_path !== photoPath/);
});

test("leadership payment review and relevant RLS checks use database roles", () => {
  assert.match(migration, /create or replace function public\.admin_review_customer_payment[\s\S]*if not \(select private\.is_admin_or_ceo\(\)\)/);
  for (const policy of [
    "delivery proofs participants read",
    "payments: participants read",
    "ratings participants read",
    "orders admin manage",
    "payments admin manage",
  ]) {
    assert.match(migration, new RegExp(`alter policy "${policy}"[\\s\\S]*?private\\.is_admin_or_ceo\\(\\)`, "i"));
  }
});
