import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("Customer Mobile initializes privacy-safe PostHog analytics from Vite env", () => {
  const analytics = source("src/services/analytics.ts");
  const main = source("src/main.tsx");

  assert.match(analytics, /VITE_POSTHOG_PROJECT_TOKEN/);
  assert.match(analytics, /VITE_POSTHOG_HOST/);
  assert.match(analytics, /autocapture:\s*false/);
  assert.match(analytics, /capture_pageview:\s*false/);
  assert.match(analytics, /disable_session_recording:\s*true/);
  assert.match(analytics, /advanced_disable_flags:\s*true/);
  assert.match(analytics, /captureAnalyticsPageview/);
  assert.match(main, /initializeAnalytics\(\)/);
});

test("Customer Mobile deployment injects PostHog runtime configuration", () => {
  const workflow = source("../../.github/workflows/deploy-pages.yml");
  assert.match(workflow, /Build Customer mobile app[\s\S]*VITE_POSTHOG_PROJECT_TOKEN/);
  assert.match(workflow, /Build Customer mobile app[\s\S]*VITE_POSTHOG_HOST/);
  assert.match(workflow, /Build Customer mobile app[\s\S]*VITE_RELEASE_SHA/);
});

test("Customer Mobile before_send preserves SDK-required transport properties", () => {
  const analytics = source("src/services/analytics.ts");
  assert.match(analytics, /const properties:\s*Record<string, unknown>\s*=\s*\{\s*\.\.\.raw\s*\}/);
  assert.doesNotMatch(analytics, /if \(key\.startsWith\("\\\$"\)\) continue/);
});
