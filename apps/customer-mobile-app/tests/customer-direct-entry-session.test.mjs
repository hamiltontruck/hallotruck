import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(
  new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url),
  "utf8",
);
const supabaseSource = readFileSync(
  new URL("../src/auth/customer-supabase.ts", import.meta.url),
  "utf8",
);

test("Customer direct entry does not reuse the legacy cross-role auth namespace", () => {
  assert.match(supabaseSource, /storageKey:\s*"hallo-customer-mobile-auth-v2"/);
  assert.doesNotMatch(supabaseSource, /storageKey:\s*"hallo-customer-mobile-auth-v1"/);
});

test("wrong-role Customer access never changes the browser URL", () => {
  assert.match(authSource, /state\.kind === "unsupported-role"/);
  assert.match(authSource, /text\.deniedTitle/);
  assert.doesNotMatch(authSource, /window\.location\.replace\(/);
  assert.doesNotMatch(authSource, /<DriverRedirect/);
});
