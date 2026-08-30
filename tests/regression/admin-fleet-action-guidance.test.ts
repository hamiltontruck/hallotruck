import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("Admin fleet smoke preserves active-trip guidance before the pending workflow lock", () => {
  const smoke = readFileSync(path.join(process.cwd(), "scripts/fleet-enterprise-e2e-smoke.mjs"), "utf8");
  const activeTripCapture = smoke.indexOf("const activeTripGuidance=");
  const adminPendingAction = smoke.indexOf("const adminPage=");

  assert.ok(activeTripCapture >= 0, "Fleet smoke must capture the active-trip lock guidance");
  assert.ok(adminPendingAction > activeTripCapture, "Active-trip guidance must be captured before starting the Admin pending action");
  assert.match(smoke, /dataset\.activeTripGuidance=String\(activeTripGuidance\)/);
  assert.match(smoke, /data-active-trip-guidance=\\"true\\"/);
});
