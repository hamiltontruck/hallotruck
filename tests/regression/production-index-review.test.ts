import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = readFileSync(
  path.join(root, "supabase/migrations/20260913020504_production_index_review_hot_paths.sql"),
  "utf8",
);
const marker = readFileSync(
  path.join(root, "supabase/production-migration-version.txt"),
  "utf8",
).trim();

test("production index review records the verified hot-path indexes", () => {
  assert.match(migration, /orders_customer_id_created_at_idx/);
  assert.match(migration, /\(customer_id, created_at desc, id desc\)/i);
  assert.match(migration, /orders_available_jobs_status_created_at_idx/);
  assert.match(migration, /where driver_id is null/i);
  assert.match(migration, /driver_commission_charges_order_id_idx/);
  assert.match(migration, /on public\.driver_commission_charges \(order_id\)/i);
});

test("duplicate customer created-at indexes are removed while the used index remains", () => {
  assert.match(migration, /drop index if exists public\.customers_admin_intelligence_created_at_idx/i);
  assert.match(migration, /drop index if exists public\.customers_created_at_desc_idx/i);
  assert.match(migration, /Keep customers_created_at_idx/);
  assert.doesNotMatch(migration, /drop index if exists public\.customers_created_at_idx/i);
});

test("index review migration never mutates business rows", () => {
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.match(marker, /^20260913020504$/);
});
