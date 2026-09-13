import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const packageJson = source("package.json");
const shellSmoke = source("scripts/admin-mobile-shell-e2e-smoke.mjs");
const dashboardSmoke = source("scripts/admin-dashboard-e2e-smoke.mjs");
const operationsSmoke = source("scripts/admin-operations-e2e-smoke.mjs");
const complianceSmoke = source("scripts/admin-driver-compliance-e2e-smoke.mjs");
const chatSmoke = source("scripts/admin-driver-chat-e2e-smoke.mjs");
const navSmoke = source("scripts/role-navigation-e2e-smoke.mjs");

const narrowWidths = [320, 360, 390, 412];

test("Admin mobile browser coverage includes all required narrow widths", () => {
  for (const width of narrowWidths) {
    for (const [label, script] of [
      ["shell", shellSmoke],
      ["dashboard", dashboardSmoke],
      ["operations", operationsSmoke],
      ["compliance", complianceSmoke],
      ["chat", chatSmoke],
      ["navigation", navSmoke],
    ] as const) {
      assert.match(script, new RegExp(`\\b${width}\\b`), `${label} smoke must cover ${width}px`);
    }
  }
});

test("Admin mobile shell smoke is part of the standard browser suite", () => {
  assert.match(packageJson, /node scripts\/admin-mobile-shell-e2e-smoke\.mjs/);
  assert.match(shellSmoke, /data-overflow/);
  assert.match(shellSmoke, /data-open-touch/);
  assert.match(shellSmoke, /data-close-touch/);
  assert.match(shellSmoke, /data-drawer-fits/);
});
