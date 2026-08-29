import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const migration = source("supabase/migrations/20260830022800_harden_payment_reference_integrity.sql");
const queue = source("src/pages/AdminPaymentReferenceConflicts.tsx");
const app = source("src/App.tsx");

test("payment references use a normalized transaction-safe registry", () => {
  assert.match(migration, /create table if not exists private\.payment_reference_registry/i);
  assert.match(migration, /primary key \(provider_key, reference_key\)/i);
  assert.match(migration, /canonical_payment_id uuid not null[\s\S]*references public\.payments\(id\)[\s\S]*deferrable initially deferred/i);
  assert.match(migration, /unique \(canonical_payment_id\)/i);
  assert.match(migration, /lower\(btrim\(coalesce\(p_provider, ''\)\)\)/i);
  assert.match(migration, /lower\(btrim\(coalesce\(p_reference, ''\)\)\)/i);
  assert.match(migration, /'cash',[\s\S]*'cash_to_driver',[\s\S]*'financial_correction'/i);
  assert.match(migration, /on conflict \(provider_key, reference_key\) do nothing/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /errcode = '23505'/i);
});

test("legacy payment rows are classified without rewriting financial history", () => {
  assert.match(migration, /with normalized as[\s\S]*insert into private\.payment_reference_registry/i);
  assert.match(migration, /legacy_conflict[\s\S]*grouped\.order_count > 1 or grouped\.active_count > 1/i);
  assert.match(migration, /'canonical'[\s\S]*'legacy_conflict'/i);
  assert.match(migration, /ranked\.event = 'refunded' then 'refunded'/i);
  assert.match(migration, /ranked\.event = 'failed' then 'superseded'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.payments/i);
  assert.doesNotMatch(migration, /update\s+public\.payments\s+set/i);
});

test("race-prone guard is replaced by an insert and update boundary trigger", () => {
  assert.match(migration, /drop trigger if exists payments_unique_reference_guard on public\.payments/i);
  assert.match(migration, /drop function if exists public\.prevent_duplicate_payment_reference\(\)/i);
  assert.match(migration, /create trigger payments_reference_integrity_guard[\s\S]*before insert or update of provider, provider_ref, event, order_id[\s\S]*private\.enforce_payment_reference_integrity\(\)/i);
  assert.match(migration, /v_registry\.canonical_payment_id = new\.id/i);
  assert.match(migration, /legacy_conflict[\s\S]*new\.event in \('failed', 'refunded'\)/i);
  assert.match(migration, /Transaction ID is already assigned to another payment for this provider/i);
});

test("payment writes are RPC-only and leadership reads use database roles", () => {
  assert.match(migration, /revoke all on table public\.payments from anon/i);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger[\s\S]*from authenticated/i);
  assert.match(migration, /grant select on table public\.payments to authenticated/i);
  assert.match(migration, /create policy "payments participants or leadership read"[\s\S]*private\.is_admin_or_ceo\(\)/i);
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/i);
});

test("leadership conflict report masks references and exposes auditable classifications", () => {
  assert.match(migration, /create or replace function public\.admin_payment_reference_conflicts\(\)/i);
  assert.match(migration, /private\.require_active_leadership\([\s\S]*admin_payment_reference_conflicts/i);
  assert.match(migration, /reference_fingerprint text/i);
  assert.match(migration, /masked_reference text/i);
  assert.match(migration, /md5\(ranked\.provider_key \|\| ':' \|\| ranked\.reference_key\)/i);
  assert.match(migration, /repeat\('\*'/i);
  assert.match(migration, /revoke all on function public\.admin_payment_reference_conflicts\(\)[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_payment_reference_conflicts\(\)[\s\S]*to authenticated/i);
});

test("Finance UI surfaces a mobile-safe reference conflict queue without false zero values", () => {
  assert.match(queue, /admin_payment_reference_conflicts/i);
  assert.match(queue, /Payment reference conflict queue/i);
  assert.match(queue, /Canonical reference/i);
  assert.match(queue, /Legacy conflict/i);
  assert.match(queue, /Refunded history/i);
  assert.match(queue, /Superseded history/i);
  assert.match(queue, /masked_reference/i);
  assert.match(queue, /reference_fingerprint/i);
  assert.match(queue, /No zero conflict count is shown because the source did not load/i);
  assert.match(queue, /max-w-full overflow-x-hidden/i);
  assert.doesNotMatch(queue, /provider_ref/);
});

test("reference conflict routes remain behind AdminGate and visible from the Payment Ledger", () => {
  assert.match(app, /function AdminPaymentReviewWorkspace\(\)\{return <><AdminPaymentReferenceConflictBanner \/><AdminPaymentWorkspace \/><\/>\}/);
  assert.match(app, /path="\/admin\/payment-review" element={<AdminGate><AdminToolShell><AdminPaymentReviewWorkspace \/><\/AdminToolShell><\/AdminGate>}/);
  assert.match(app, /path="\/admin\/payment-review\/reference-conflicts" element={<AdminGate><AdminToolShell><AdminPaymentReferenceConflicts \/><\/AdminToolShell><\/AdminGate>}/);
});
