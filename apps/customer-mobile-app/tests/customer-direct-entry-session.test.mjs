import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(
  new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url),
  "utf8",
);

test("restored non-Customer sessions are cleared without changing the Customer URL", () => {
  assert.match(authSource, /CUSTOMER_AUTH_INTENT_KEY/);
  assert.match(authSource, /resolveSession\(data\.session,\s*"restore"\)/);
  assert.match(authSource, /source === "restore"/);
  assert.match(authSource, /await client\.auth\.signOut\(\)/);
  assert.match(authSource, /setShowSplash\(false\)/);
  assert.doesNotMatch(authSource, /window\.location\.replace\(/);
});

test("an explicit wrong-role sign-in stays on Customer Mobile and shows Customer access denial", () => {
  assert.match(authSource, /resolveSession\(data\.session,\s*"explicit"\)/);
  assert.match(authSource, /state\.kind === "unsupported-role"/);
  assert.match(authSource, /text\.deniedTitle/);
  assert.doesNotMatch(authSource, /<DriverRedirect/);
});
