import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const profilePage = fs.readFileSync(new URL("../src/CustomerDataPages.tsx", import.meta.url), "utf8");
const authBoundary = fs.readFileSync(new URL("../src/auth/CustomerAuthBoundary.tsx", import.meta.url), "utf8");

test("Customer Profile exposes a visible sign-out action", () => {
  assert.match(profilePage, /customerSupabase/);
  assert.match(profilePage, /client\.auth\.signOut\(\)/);
  assert.match(profilePage, /Account keessaa ba'i/);
  assert.match(profilePage, /disabled=\{signingOut\}/);
  assert.match(profilePage, /aria-busy=\{signingOut\}/);
});

test("sign-out relies on the existing auth boundary to fail closed", () => {
  assert.match(authBoundary, /auth\.onAuthStateChange/);
  assert.match(authBoundary, /if \(!session\)/);
  assert.match(authBoundary, /setState\(\{ kind: "signed-out", error: null \}\)/);
});

test("session control adds no business-data mutation", () => {
  assert.doesNotMatch(profilePage, /\.insert\s*\(/);
  assert.doesNotMatch(profilePage, /\.update\s*\(/);
  assert.doesNotMatch(profilePage, /\.delete\s*\(/);
  assert.doesNotMatch(profilePage, /service[_-]?role/i);
});
