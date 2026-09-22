import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../src/driver/DriverProfileView.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/DriverWorkspace.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/driver-v4.css", import.meta.url), "utf8");

test("Driver V4 profile keeps EN/OR/AM copy on the profile surface", () => {
  assert.match(profile, /type DriverLanguage = "om" \| "en" \| "am"/);
  assert.match(profile, /Identity & compliance/);
  assert.match(profile, /Eenyummaa fi mirkaneessa/);
  assert.match(profile, /መታወቂያ እና ማረጋገጫ/);
  assert.match(profile, /Driver profile photo/);
  assert.match(profile, /Suuraa Driver/);
  assert.match(profile, /የአሽከርካሪ ፕሮፋይል ፎቶ/);
});

test("workspace passes the selected language into Driver profile", () => {
  assert.match(workspace, /<DriverProfileView[\s\S]*language=\{language\}/);
});

test("profile parity polish stays scoped to Driver V4 profile", () => {
  assert.match(css, /\[data-mobile-driver-profile\]/);
  assert.doesNotMatch(css, /auth-shell|login-form|sign-in-form/);
});
