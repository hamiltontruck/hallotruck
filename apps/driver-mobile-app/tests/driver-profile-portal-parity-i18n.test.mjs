import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../src/driver/DriverProfileView.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/DriverWorkspace.tsx", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/driver/driver-v4-i18n.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/driver-v4.css", import.meta.url), "utf8");

test("Driver V4 profile uses the centralized EN/OR/AM authenticated copy", () => {
  assert.match(profile, /getDriverV4Copy/);
  assert.match(profile, /language\?: DriverLanguage/);
  for (const value of [
    "Identity & compliance",
    "Eenyummaa fi mirkaneessa",
    "መታወቂያ እና ማረጋገጫ",
    "Driver profile photo",
    "Suuraa Driver",
    "የአሽከርካሪ ፕሮፋይል ፎቶ",
  ]) assert.match(i18n, new RegExp(value));
});

test("workspace passes the selected language into Driver profile", () => {
  assert.match(workspace, /<DriverProfileView[\s\S]*language=\{language\}/);
});

test("profile missing-value fallback is not hard-coded Oromo", () => {
  const model = readFileSync(new URL("../src/driver/driver-profile.model.ts", import.meta.url), "utf8");
  assert.doesNotMatch(model, /return "Hin galmoofne"/);
  assert.match(profile, /p\.missing/);
});

test("profile parity polish stays scoped to Driver V4 profile", () => {
  assert.match(css, /\[data-mobile-driver-profile\]/);
  assert.doesNotMatch(css, /auth-shell|login-form|sign-in-form|\.driver-auth/);
});
