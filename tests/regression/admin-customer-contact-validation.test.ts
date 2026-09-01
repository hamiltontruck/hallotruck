import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260901070000_validate_customer_contact.sql",
);
const migration = await readFile(migrationPath, "utf8");
const migrationSql = migration.replace(/--.*$/gm, "");
const adminService = await readFile(
  path.join(process.cwd(), "src/services/admin.service.ts"),
  "utf8",
);

test("admin customer creation validates and normalizes contact before insert", () => {
  assert.match(adminService, /const phone = requireValidEthiopianPhone\(input\.phone\)/);
  assert.match(
    adminService,
    /const email = input\.email\?\.trim\(\) \? requireValidEmail\(input\.email\) : null/,
  );
  assert.match(adminService, /from\("customers"\)\.insert\(\{[\s\S]*phone,[\s\S]*email,/);
  assert.doesNotMatch(adminService, /phone: input\.phone/);
  assert.doesNotMatch(adminService, /email: input\.email \|\| null/);
});

test("customer contact validation is enforced at the table boundary", () => {
  assert.match(migration, /create or replace function public\.normalize_customer_contact\(\)/);
  assert.match(
    migration,
    /create trigger customers_normalize_contact[\s\S]*before insert or update of phone, email on public\.customers/,
  );
  assert.match(migration, /for each row[\s\S]*execute function public\.normalize_customer_contact\(\)/);
});

test("Ethiopian mobile numbers are validated and stored in 09 format", () => {
  assert.match(migration, /\^\(\\\+251\|251\|0\)\?9\[0-9\]\{8\}\$/);
  assert.match(migration, /compact_phone like '\+251%'[\s\S]*'0' \|\| substr\(compact_phone, 5\)/);
  assert.match(migration, /compact_phone like '251%'[\s\S]*'0' \|\| substr\(compact_phone, 4\)/);
  assert.match(migration, /compact_phone like '9%'[\s\S]*'0' \|\| compact_phone/);
  assert.match(migration, /Phone must be an Ethiopian mobile number: 09xxxxxxxx or \+2519xxxxxxxx\./);
});

test("email remains optional but malformed non-empty values fail closed", () => {
  assert.match(migration, /normalized_email := lower\(trim\(coalesce\(new\.email, ''\)\)\)/);
  assert.match(migration, /if normalized_email = '' then\s+new\.email := null/);
  assert.match(migration, /length\(normalized_email\) > 254/);
  assert.match(migration, /Enter a valid email address, for example name@example\.com\./);
  assert.match(migration, /new\.email := normalized_email/);
});

test("validation helper is atomic, search-path safe, and not directly executable", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.normalize_customer_contact\(\) from public, anon, authenticated/,
  );
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(migrationSql, /security definer/i);
});

test("migration does not rewrite existing customer rows", () => {
  assert.doesNotMatch(migrationSql, /\bupdate\s+public\.customers\b/i);
  assert.doesNotMatch(migrationSql, /\bdelete\s+from\s+public\.customers\b/i);
});
