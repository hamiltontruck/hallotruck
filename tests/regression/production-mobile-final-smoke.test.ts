import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const packageJson = source("package.json");
const roleNavigationSmoke = source("scripts/role-navigation-e2e-smoke.mjs");
const customerSmoke = source("scripts/customer-profile-payments-e2e-smoke.mjs");
const partnerSmoke = source("scripts/partner-e2e-smoke.mjs");
const partnerWalletSmoke = source("scripts/partner-wallet-e2e-smoke.mjs");
const tripCompletionSmoke = source("scripts/trip-completion-e2e-smoke.mjs");
const adminShellSmoke = source("scripts/admin-mobile-shell-e2e-smoke.mjs");
const navigationCss = source("src/styles/role-navigation.css");
const partnerCss = source("src/index.css");
const partnerHub = source("src/pages/PartnerOperationsHub.tsx");

const narrowWidths = [320, 360, 390, 412];

test("production mobile browser coverage spans Admin, Customer, Driver and Partner at all release widths", () => {
  for (const width of narrowWidths) {
    for (const [label, script] of [
      ["role navigation", roleNavigationSmoke],
      ["customer", customerSmoke],
      ["partner workspace", partnerSmoke],
      ["partner wallet", partnerWalletSmoke],
      ["trip completion", tripCompletionSmoke],
      ["admin shell", adminShellSmoke],
    ] as const) {
      assert.match(script, new RegExp(`\\b${width}\\b`), `${label} smoke must cover ${width}px`);
    }
  }
});

test("all cross-role mobile smokes remain in the standard browser release gate", () => {
  for (const script of [
    "role-navigation-e2e-smoke.mjs",
    "customer-profile-payments-e2e-smoke.mjs",
    "partner-e2e-smoke.mjs",
    "partner-wallet-e2e-smoke.mjs",
    "trip-completion-e2e-smoke.mjs",
    "admin-mobile-shell-e2e-smoke.mjs",
  ]) {
    assert.match(packageJson, new RegExp(`node scripts\\/${script.replaceAll(".", "\\.")}`));
  }
});

test("mobile release smoke explicitly protects overflow, safe-area navigation and touch targets", () => {
  assert.match(roleNavigationSmoke, /data-overflow=\"false\"/);
  assert.match(customerSmoke, /data-overflow=\"false\"/);
  assert.match(partnerSmoke, /data-overflow=\"false\"/);
  assert.match(partnerWalletSmoke, /data-overflow=\"false\"/);
  assert.match(adminShellSmoke, /data-overflow=\"false\"/);

  assert.match(navigationCss, /min-height: 4\.15rem/);
  assert.match(navigationCss, /env\(safe-area-inset-bottom\)/);
  assert.match(adminShellSmoke, /data-open-touch=\"true\"/);
  assert.match(adminShellSmoke, /data-close-touch=\"true\"/);
  assert.match(partnerSmoke, /data-touch-safe=\"true\"/);
  assert.match(partnerHub, /partner-mobile-touch-safe/);
  assert.match(partnerCss, /\.partner-mobile-touch-safe button,[\s\S]*min-height: 44px/);
});
