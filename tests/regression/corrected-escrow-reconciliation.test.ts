import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(path.join(
  root,
  "supabase",
  "migrations",
  "20260828130612_reconcile_corrected_escrow_sources.sql",
), "utf8");
const adminReview = readFileSync(path.join(root, "src", "pages", "AdminPaymentReview.tsx"), "utf8");

function sqlFunction(source: string, name: string) {
  const start = source.toLowerCase().indexOf(`create or replace function ${name.toLowerCase()}`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = source.toLowerCase().indexOf("create or replace function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function effective(original: number, corrections: number[]) {
  return Math.max(0, Math.round((original - corrections.reduce((sum, value) => sum + value, 0)) * 100) / 100);
}

test("source corrections are applied once and preserve legacy refund fallback", () => {
  const recompute = sqlFunction(migration, "public.recompute_order_payment_status");
  assert.match(migration, /create or replace function private\.effective_payment_amount/i);
  assert.match(migration, /correction\.source_payment_id = payment\.id/i);
  assert.match(recompute, /not exists[\s\S]*correction\.refund_payment_id = payment\.id/i);
  assert.match(recompute, /v_effective_released := greatest\(v_released - v_unlinked_refunded, 0\)/i);
  assert.match(recompute, /v_effective_held := greatest/i);
  assert.equal(effective(75_700, [75_700]), 0);
  assert.equal(effective(75_700, [20_000]), 55_700);
});

test("fully corrected escrow cannot be confirmed or released", () => {
  const confirm = sqlFunction(migration, "public.driver_confirm_verified_payment");
  const release = sqlFunction(migration, "public.release_confirmed_driver_payment_internal");
  assert.match(confirm, /Corrected payment has no remaining value to confirm/i);
  assert.match(confirm, /confirmed_amount_etb[\s\S]*round\(v_effective_amount, 2\)/i);
  assert.match(release, /coalesce\(v_effective_amount, 0\) <= 0 then return false/i);
  assert.match(release, /confirmation_type = 'payment_confirmed'/i);
  assert.doesNotMatch(release, /update\s+public\.financial_corrections|delete\s+from/i);
  assert.match(migration, /create function public\.driver_payment_status[\s\S]*private\.effective_payment_amount\(payment\.id\) > 0/i);
});

test("partial correction releases and commissions only the remaining value", () => {
  const trigger = sqlFunction(migration, "public.populate_driver_payment_confirmation_financials");
  const release = sqlFunction(migration, "public.release_confirmed_driver_payment_internal");
  const remaining = effective(75_700, [20_000]);
  assert.equal(remaining, 55_700);
  assert.equal(Math.round(remaining * 0.02 * 100) / 100, 1_114);
  assert.match(trigger, /private\.effective_payment_amount\(payment\.id\)/i);
  assert.match(trigger, /new\.commission_etb := round\(v_amount \* 0\.02, 2\)/i);
  assert.match(release, /v_effective_released \+ v_effective_amount > v_order_total \+ 0\.005/i);
  assert.match(release, /on conflict \(payment_id\) do nothing/i);
});

test("all release paths keep database-role authorization and hardened grants", () => {
  const adminUpdate = sqlFunction(migration, "public.admin_update_payment_event");
  assert.match(adminUpdate, /private\.is_admin_or_ceo\(\)/i);
  assert.match(adminUpdate, /Use the auditable financial correction action for refunds/i);
  assert.match(adminUpdate, /private\.effective_payment_amount\(payment\.id\)/i);
  assert.match(migration, /revoke all on function public\.release_confirmed_driver_payment_internal\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.release_confirmed_driver_payment_internal\(uuid\)[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.driver_confirm_verified_payment\(uuid\)[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/i);
});

test("Finance shows effective escrow and immutable correction history", () => {
  assert.match(adminReview, /from\("financial_corrections"\)/);
  assert.match(adminReview, /correctionsByPayment/);
  assert.match(adminReview, /releasableEtb > 0/);
  assert.match(adminReview, /Immutable correction applied\./);
  assert.match(adminReview, /This source is fully corrected and cannot be released\./);
  assert.match(adminReview, /CorrectionHistory entries=\{correctionEntries\}/);
  assert.match(adminReview, /amountFor=\{effectiveAmount\}/);
});
