import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migration = await readFile(path.join(process.cwd(), "supabase/migrations/20260831214500_harden_driver_document_review.sql"), "utf8");
const workspace = await readFile(path.join(process.cwd(), "src/pages/AdminDriverCompliance.tsx"), "utf8");
const smoke = await readFile(path.join(process.cwd(), "scripts/admin-driver-compliance-e2e-smoke.mjs"), "utf8");

test("document review policies use current database-backed leadership", () => {
  assert.match(migration, /drop policy if exists "driver verification leadership manage"/);
  assert.match(migration, /driver verification leadership read[\s\S]*private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /driver verification history leadership read[\s\S]*private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /driver verification storage leadership read[\s\S]*private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /driver verification storage leadership insert[\s\S]*with check[\s\S]*private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /driver verification storage leadership cleanup[\s\S]*for delete[\s\S]*private\.is_admin_or_ceo\(\)/);
  assert.match(migration, /current_file\.file_path = storage\.objects\.name/);
  assert.match(migration, /history_file\.file_path = storage\.objects\.name/);
  assert.doesNotMatch(migration, /app_metadata|user_metadata/);
  assert.doesNotMatch(migration, /service_role/);
});

test("review mutation is guarded, stale-safe and rejects expired approval", () => {
  assert.match(migration, /private\.require_active_leadership\('admin_review_driver_verification_document'\)/);
  assert.match(migration, /verification\.file_path = p_expected_file_path/);
  assert.match(migration, /verification\.status = 'pending'/);
  assert.match(migration, /v_expiry_date < current_date/);
  assert.match(migration, /reviewed_by = auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.admin_review_driver_verification_document[\s\S]*to authenticated/);
});

test("Admin workspace surfaces approved Drivers with pending replacement evidence", () => {
  assert.match(workspace, /pendingDocumentDriverIds/);
  assert.match(workspace, /pendingDocumentDriverIds\.has\(driver\.id\)/);
  assert.match(workspace, /isCurrentVerifiedDocument\(doc\)/);
  assert.match(workspace, /supabase\.rpc\("admin_review_driver_verification_document"/);
  assert.match(workspace, /p_expected_file_path: doc\.file_path/);
  assert.doesNotMatch(workspace, /from\("driver_verification_files"\)\.update/);
  assert.match(smoke, /Approved Replacement Driver/);
  assert.match(smoke, /replacement\.jpg/);
});
