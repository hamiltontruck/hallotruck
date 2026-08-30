import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normalizeAnalyticsRoute,
  sanitizeAnalyticsProperties,
  sanitizePostHogEvent,
} from "../../src/domain/analytics";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("analytics routes remove query strings and opaque order identifiers", () => {
  assert.equal(normalizeAnalyticsRoute("#/driver/payment/550e8400-e29b-41d4-a716-446655440000?token=secret"), "/driver/payment/:orderId");
  assert.equal(normalizeAnalyticsRoute("https://example.com/hallotruck/#/customer/tracking/HT-2026-ABC123?phone=0911223344"), "/customer/tracking/:orderId");
  assert.equal(normalizeAnalyticsRoute("#/admin/operations?section=Finance&q=person@example.com"), "/admin/operations");
});

test("custom analytics properties use a strict non-PII allowlist", () => {
  assert.deepEqual(sanitizeAnalyticsProperties({
    role: "driver",
    outcome: "success",
    payment_method: "cash",
    phone: "0911223344",
    email: "person@example.com",
    provider_ref: "BANK-REFERENCE-123",
    receipt_path: "private/receipt.png",
    password: "never-capture-this",
    route: "/driver/trip",
  }), {
    role: "driver",
    outcome: "success",
    payment_method: "cash",
    route: "/driver/trip",
  });
});

test("before-send privacy boundary removes sensitive nested values and unsafe event types", () => {
  assert.equal(sanitizePostHogEvent({ event: "$autocapture", properties: { text: "Pay now" } }), null);
  assert.equal(sanitizePostHogEvent({ event: "$snapshot", properties: {} }), null);
  assert.equal(sanitizePostHogEvent({ event: "$exception", properties: { message: "private" } }), null);

  const cleaned = sanitizePostHogEvent({
    event: "payment_confirmed",
    properties: {
      role: "driver",
      phone: "0911223344",
      customer_name: "Private Customer",
      nested: { transaction_id: "TX-123", outcome: "success" },
    },
  }) as { properties: Record<string, unknown> };
  assert.deepEqual(cleaned.properties, { role: "driver", nested: { outcome: "success" } });
});

test("before-send replaces raw URL values with normalized application routes", () => {
  const cleaned = sanitizePostHogEvent({
    event: "$pageview",
    properties: {
      $current_url: "https://example.com/#/driver/payment/private?phone=0911223344",
      $pathname: "/private",
      $referrer: "https://private.example.com",
    },
  }, "/driver/payment/:orderId", "https://example.com/hallotruck/#/driver/payment/:orderId") as { properties: Record<string, unknown> };
  assert.equal(cleaned.properties.$current_url, "https://example.com/hallotruck/#/driver/payment/:orderId");
  assert.equal(cleaned.properties.$pathname, "/driver/payment/:orderId");
  assert.equal(cleaned.properties.$referrer, "");
});

test("production analytics configuration disables broad automatic collection", () => {
  const analytics = source("src/services/analytics.ts");
  const main = source("src/main.tsx");
  const workflow = source(".github/workflows/deploy-pages.yml");
  assert.match(analytics, /autocapture: false/);
  assert.match(analytics, /capture_pageview: false/);
  assert.match(analytics, /disable_session_recording: true/);
  assert.match(analytics, /advanced_disable_flags: true/);
  assert.match(analytics, /before_send: .*sanitizePostHogEvent/);
  assert.match(analytics, /VITE_POSTHOG_PROJECT_TOKEN/);
  assert.match(main, /initializeAnalytics/);
  assert.match(workflow, /VITE_POSTHOG_PROJECT_TOKEN/);
  assert.match(workflow, /VITE_RELEASE_SHA/);
});
