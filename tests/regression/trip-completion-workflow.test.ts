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
const confirmationMigration = readFileSync(path.join(
  root,
  "supabase/migrations/20260828120000_assigned_driver_payment_confirmation_gate.sql",
), "utf8");
const deliveryService = readFileSync(path.join(root, "src/services/delivery-proof.service.ts"), "utf8");
const activeTrip = readFileSync(path.join(root, "src/pages/ActiveTrip.tsx"), "utf8");
const driverConfirmation = readFileSync(path.join(root, "src/components/driver/DriverPaymentConfirmation.tsx"), "utf8");
const driverPaymentService = readFileSync(path.join(root, "src/services/driver-payment.service.ts"), "utf8");
const driverCollectionPage = readFileSync(path.join(root, "src/pages/DriverPaymentCollection.tsx"), "utf8");
const driverCollectionService = readFileSync(path.join(root, "src/services/driver-payment-collection.service.ts"), "utf8");
const financePage = readFileSync(path.join(root, "src/pages/AdminPaymentReview.tsx"), "utf8");

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

function sqlFunction(source: string, functionName: string) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`create or replace function ${escaped}[\\s\\S]*?\\$function\\$;`, "i"));
  assert.ok(match, `${functionName} should exist`);
  return match[0];
}

test("POD completion sends every driver to the completed-trip payment page", () => {
  assert.equal(getDriverPostDeliveryRoute("pay_driver_on_delivery", "order-1"), "/driver/payment/order-1");
  assert.equal(getDriverPostDeliveryRoute("prepaid", "order-1"), "/driver/payment/order-1");
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

test("assigned driver confirmation records immutable database-backed audit fields", () => {
  assert.match(confirmationMigration, /create table if not exists public\.driver_payment_confirmation_events/);
  for (const column of [
    "order_id", "assigned_driver_id", "payment_id", "confirmation_type",
    "confirmed_amount_etb", "provider", "confirmed_at", "actor_id",
  ]) {
    assert.match(confirmationMigration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(confirmationMigration, /unique index[\s\S]*payment_id, confirmation_type/i);
  assert.match(confirmationMigration, /before update or delete on public\.driver_payment_confirmation_events/);
  assert.match(confirmationMigration, /Driver payment confirmation history is immutable/);
  assert.match(confirmationMigration, /create policy "driver payment confirmation leadership read"[\s\S]*private\.is_admin_or_ceo\(\)/);
  assert.match(confirmationMigration, /revoke all on table public\.driver_payment_confirmation_events from public, anon, authenticated/);
});

test("only the database-assigned Driver can confirm and duplicates are denied", () => {
  const confirmFunction = sqlFunction(confirmationMigration, "public.driver_confirm_verified_payment");
  assert.match(confirmFunction, /v_assigned_driver is distinct from v_actor/);
  assert.match(confirmFunction, /profile\.role::text = 'driver'/);
  assert.match(confirmFunction, /v_order_status <> 'delivered'/);
  assert.match(confirmFunction, /v_event <> 'held_escrow'/);
  assert.match(confirmFunction, /already confirmed by the assigned driver/);
  assert.match(confirmFunction, /confirmation_type[\s\S]*'payment_confirmed'/);
  assert.doesNotMatch(confirmFunction, /insert into public\.driver_payment_confirmations/i);
  assert.doesNotMatch(confirmFunction, /release_confirmed_driver_payment_internal/);
  assert.doesNotMatch(confirmFunction, /insert into public\.driver_commission_charges/i);
});

test("release is denied before confirmation and succeeds only through Admin or CEO", () => {
  const releaseFunction = sqlFunction(confirmationMigration, "public.admin_release_confirmed_driver_payment");
  assert.match(releaseFunction, /private\.is_admin_or_ceo\(\)/);
  assert.match(releaseFunction, /confirmation_type = 'payment_confirmed'/);
  assert.match(releaseFunction, /Assigned driver confirmation is required before releasing this payment/);
  assert.match(releaseFunction, /public\.release_confirmed_driver_payment_internal\(p_payment_id\)/);
  assert.match(confirmationMigration, /drop trigger if exists release_confirmed_payments_after_delivery_trigger/);
  assert.doesNotMatch(confirmationMigration, /create trigger release_confirmed_payments_after_delivery_trigger/);
});

test("payment-not-received keeps escrow locked and creates no commission", () => {
  const notReceivedFunction = sqlFunction(confirmationMigration, "public.driver_report_payment_not_received");
  assert.match(notReceivedFunction, /confirmation_type[\s\S]*'payment_not_received'/);
  assert.match(notReceivedFunction, /v_event <> 'held_escrow'/);
  assert.match(notReceivedFunction, /perform public\.recompute_order_payment_status\(v_order_id\)/);
  assert.doesNotMatch(notReceivedFunction, /update public\.payments[\s\S]*set event/);
  assert.doesNotMatch(notReceivedFunction, /driver_payment_confirmations|driver_commission_charges/);
});

test("Held Escrow is no longer mislabeled as released", () => {
  const recomputeFunction = sqlFunction(confirmationMigration, "public.recompute_order_payment_status");
  assert.match(recomputeFunction, /v_net_released := greatest\(0, v_released - v_refunded\)/);
  assert.match(recomputeFunction, /v_net_released >= v_total then 'released'/);
  assert.match(recomputeFunction, /v_held > 0 or v_net_released > 0 then 'held_escrow'/);
  assert.doesNotMatch(recomputeFunction, /v_released\s*\+\s*v_held/);
});

test("Driver UI is simple, shows provider details and has no receipt upload", () => {
  for (const label of [
    "Payment method",
    "Cash",
    "Bank / Telebirr",
    "Customer payment amount",
    "Payment confirmed",
    "Payment not received / not confirmed",
    "No receipt or screenshot upload is required",
  ]) {
    assert.match(driverConfirmation, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(driverConfirmation, /Bank of Abyssinia/);
  assert.match(driverConfirmation, /payment\.provider_ref/);
  assert.doesNotMatch(driverConfirmation, /type="file"|payment-receipts|receipt_path/);
  assert.match(driverPaymentService, /rpc\("driver_confirm_verified_payment"/);
  assert.match(driverPaymentService, /rpc\("driver_report_payment_not_received"/);
});

test("completed-trip collection no longer uploads Driver receipts or screenshots", () => {
  assert.match(driverCollectionPage, /No receipt upload\. No screenshot upload\./);
  assert.doesNotMatch(driverCollectionPage, /type="file"|accept="image\/|setReceipt|receipt,/);
  assert.doesNotMatch(driverCollectionService, /storage\.from|\.upload\(|allowedEvidenceTypes|Payment evidence is required/);
  assert.match(driverCollectionService, /p_receipt_path: null/);
});

test("Finance shows assigned-driver state and exposes a separate release action", () => {
  assert.match(financePage, /Assigned driver confirmation is required before releasing this payment\./);
  assert.match(financePage, /Assigned driver confirmed payment\./);
  assert.match(financePage, /payment not received \/ not confirmed/i);
  assert.match(financePage, /rpc\("admin_release_confirmed_driver_payment"/);
  assert.match(financePage, /Release ETB/);
  assert.match(financePage, /driver_payment_confirmation_events/);
});
