import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const gate = readFileSync(path.join(process.cwd(), "src", "components", "auth", "PartnerGate.tsx"), "utf8");

test("Partner login keeps real Supabase auth and membership verification", () => {
  assert.match(gate, /signInWithPassword\s*\(\s*\{\s*email:/);
  assert.match(gate, /getPartnerLoginAccess\(\)/);
  assert.match(gate, /supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(gate, /signInWithOtp|fake|mock/i);
});

test("Partner login provides approved multilingual accessible V4 controls", () => {
  assert.match(gate, /type PartnerLocale = "en" \| "or" \| "am"/);
  assert.match(gate, /Afaan Oromoo/);
  assert.match(gate, /አማርኛ/);
  assert.match(gate, /showPassword/);
  assert.match(gate, /aria-live="polite"/);
  assert.match(gate, /aria-invalid=/);
  assert.match(gate, /autoComplete="email"/);
  assert.match(gate, /autoComplete="current-password"/);
});

test("Partner forgot-password uses the existing real recovery service and does not invent phone auth", () => {
  assert.match(gate, /requestPasswordResetEmail/);
  assert.match(gate, /await requestPasswordResetEmail\(email\.trim\(\)\)/);
  assert.doesNotMatch(gate, /signInWithOtp|verifyOtp|phone:\s*/);
});

test("Partner login does not invent remember-me persistence outside Supabase session behavior", () => {
  assert.doesNotMatch(gate, /localStorage|sessionStorage|persistSession|rememberMe/);
});
