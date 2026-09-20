import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/auth/CustomerAuthBoundaryV2.tsx", "utf8");

test("fresh Google Customer completes a database-backed public profile", () => {
  assert.match(source, /kind: "missing-profile"; session: Session/);
  assert.match(source, /complete_public_mobile_profile/);
  assert.match(source, /p_role: "customer"/);
  assert.match(source, /auth\.refreshSession\(\)/);
  assert.match(source, /CustomerProfileCompletion/);
});

test("Customer phone onboarding accepts Ethiopian 07 and 09 families", () => {
  assert.match(source, /\[79\]\\d\{8\}/);
  assert.match(source, /09xxxxxxxx \/ 07xxxxxxxx/);
});

test("non-Customer database roles stay outside the Customer workspace", () => {
  assert.match(source, /unsupported-role/);
  assert.match(source, /state\.role === "driver"/);
  assert.match(source, /DriverRedirect/);
});


test("latest-main PIN hardening remains intact beside Google onboarding", () => {
  assert.match(source, /inputMode="numeric"/);
  assert.match(source, /pattern="\[0-9\]\{6\}"/);
  assert.match(source, /maxLength=\{6\}/);
  assert.match(source, /if \(!\/\^\\d\{6\}\$\/\.test\(password\)\)/);
});
