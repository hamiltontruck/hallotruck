import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Customer Mobile exposes Sign In and Create Account modes", () => {
  assert.match(auth, /Create Account/);
  assert.match(auth, /client\.auth\.signUp/);
  assert.match(auth, /full_name: cleanName/);
  assert.match(auth, /phone: normalizedPhone/);
  assert.match(auth, /role: "customer"/);
  assert.match(auth, /Account created\. Confirm your email, then sign in\./);
});

test("Customer Mobile keeps database-role verification after signup", () => {
  assert.match(auth, /from\("profiles"\)/);
  assert.match(auth, /classifyCustomerProfile\(data\)/);
  assert.match(auth, /unsupported-role/);
  assert.match(auth, /missing-profile/);
});

test("Customer Mobile shows HALLO branding at the top of auth", () => {
  assert.match(auth, /aria-label="HALLO logo"/);
  assert.match(auth, /HALLO<span/);
  assert.match(auth, /Customer Mobile/);
  assert.match(main, /CustomerAuthBoundaryV2/);
});
