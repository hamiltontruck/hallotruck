import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeEthiopianPhone,
  validateEmailAddress,
} from "../../src/domain/contact-validation";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260901070000_validate_customer_contact.sql",
);
const migration = await readFile(migrationPath, "utf8");
const migrationSql = migration.replace(/--.*$/gm, "");

const publicSignupMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260904234500_harden_public_signup_contact_validation.sql",
);
const publicSignupMigration = await readFile(publicSignupMigrationPath, "utf8");
const publicSignupMigrationSql = publicSignupMigration.replace(/--.*$/gm, "");

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

test("public signup accepts valid Ethiopian 09 and 07 mobile formats and normalizes them", () => {
  assert.equal(normalizeEthiopianPhone("0912345678"), "0912345678");
  assert.equal(normalizeEthiopianPhone("0712345678"), "0712345678");
  assert.equal(normalizeEthiopianPhone("+251 91 234 5678"), "0912345678");
  assert.equal(normalizeEthiopianPhone("+251 71 234 5678"), "0712345678");
  assert.equal(normalizeEthiopianPhone("251912345678"), "0912345678");
  assert.equal(normalizeEthiopianPhone("712345678"), "0712345678");
  assert.equal(normalizeEthiopianPhone("0612345678"), null);
  assert.equal(normalizeEthiopianPhone("091234567"), null);
  assert.equal(normalizeEthiopianPhone("+12025550123"), null);
});

test("public signup rejects malformed email syntax before auth submission", () => {
  assert.equal(validateEmailAddress(" Name.Example+tag@Sub.Example.com "), "name.example+tag@sub.example.com");
  assert.equal(validateEmailAddress("user@example.co.et"), "user@example.co.et");
  for (const invalid of [
    "userexample.com",
    "user@@example.com",
    ".user@example.com",
    "user.@example.com",
    "user..name@example.com",
    "user@-example.com",
    "user@example-.com",
    "user@example..com",
    "user@example",
  ]) {
    assert.equal(validateEmailAddress(invalid), null, invalid);
  }
});

test("public signup trigger enforces phone and email validation at the database boundary", () => {
  assert.match(publicSignupMigration, /create or replace function public\.handle_new_driver\(\)/i);
  assert.match(publicSignupMigration, /normalized_email text := lower\(btrim\(coalesce\(new\.email, ''\)\)\)/i);
  assert.match(publicSignupMigration, /new\.raw_user_meta_data ->> 'phone'/i);
  assert.match(publicSignupMigration, /\[79\]\[0-9\]\{8\}/i);
  assert.match(publicSignupMigration, /09xxxxxxxx, 07xxxxxxxx, \+2519xxxxxxxx or \+2517xxxxxxxx/i);
  assert.match(publicSignupMigration, /normalized_phone/i);
  assert.match(publicSignupMigration, /insert into public\.profiles/i);
  assert.match(publicSignupMigration, /revoke all on function public\.handle_new_driver\(\) from public, anon, authenticated/i);
  assert.match(publicSignupMigration, /set search_path = ''/i);
});

test("signup hardening changes future validation without rewriting existing profile rows", () => {
  assert.match(publicSignupMigration, /^begin;/i);
  assert.match(publicSignupMigration, /commit;\s*$/i);
  assert.doesNotMatch(publicSignupMigrationSql, /\bupdate\s+public\.profiles\b/i);
  assert.doesNotMatch(publicSignupMigrationSql, /\bdelete\s+from\s+public\.profiles\b/i);
  assert.doesNotMatch(publicSignupMigrationSql, /\bdelete\s+from\s+auth\.users\b/i);
});
