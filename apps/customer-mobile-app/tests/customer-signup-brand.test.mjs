import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Customer Mobile exposes Sign In and below-card Create Account modes", () => {
  assert.match(auth, /Create a Customer account/);
  assert.match(auth, /Back to Sign in/);
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

test("Customer Mobile shows the official HALLO Smart Logistics brand on splash and auth", () => {
  assert.match(auth, /aria-label="HALLO logo"/);
  assert.match(auth, /<strong>HALLO<\/strong>/);
  assert.match(auth, /<small>Smart Logistics<\/small>/);
  assert.match(auth, /function Splash/);
  assert.match(main, /CustomerAuthBoundaryV2/);
});


test("Customer auth keeps six-digit PIN sanitization executable", () => {
  assert.ok(auth.includes('event.target.value.replace(/\\s/g, "")'));
  assert.ok(auth.includes('event.target.value.replace(/\\D/g, "").slice(0, 6)'));
  assert.ok(auth.includes('if (!/^\\d{6}$/.test(password)) throw new Error(text.passwordInvalid);'));
  assert.ok(!auth.includes('replace(/\\\\D/g, "")'));
  assert.ok(!auth.includes('/^\\\\d{6}$/'));
});
