import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Compile the pure security helper with the existing TypeScript toolchain.
// No PostHog credentials, browser session or network calls are required.
const root = fileURLToPath(new URL("..", import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "hallo-analytics-privacy-"));
const input = path.join(root, "src/services/analytics-privacy.ts");
execFileSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), input,
  "--target", "ES2022", "--module", "CommonJS", "--moduleResolution", "node",
  "--skipLibCheck", "--outDir", output], { stdio: "pipe" });
const require = createRequire(import.meta.url);
const { safeCustomerAnalyticsRoute, safeCustomerAnalyticsUrl,
  sanitizeCustomerAnalyticsProperties, sanitizeCustomerPostHogEvent
} = require(path.join(output, "analytics-privacy.js"));
process.on("exit", () => rmSync(output, { recursive: true, force: true }));

const TOKEN = "header.payload.signature-private-test-value";
const origin = "https://hamiltontruck.github.io";
const hostedPath = "/hallotruck/customer-mobile/";

test("OAuth and refresh tokens never become analytics route or URL content", () => {
  for (const hash of [
    "#access_token=" + TOKEN + "&refresh_token=private-refresh&token_type=bearer",
    "#/access_token=" + TOKEN,
    "#/home/access_token=" + TOKEN,
    "#error_description=private-details",
    "#/orders/550e8400-e29b-41d4-a716-446655440000",
    "#/secret%2F" + TOKEN,
  ]) {
    const route = safeCustomerAnalyticsRoute(hash, hostedPath);
    const url = safeCustomerAnalyticsUrl(origin, route);
    assert.equal(route, "/hallotruck/customer-mobile");
    for (const word of ["access_token", "refresh_token", TOKEN, "private-details"]) {
      assert.equal(JSON.stringify([route, url]).includes(word), false);
    }
  }
});

test("known fixed routes are retained, dynamic IDs and unknown paths fail closed", () => {
  assert.equal(safeCustomerAnalyticsRoute("#/orders?access_token=secret", hostedPath), "/orders");
  assert.equal(safeCustomerAnalyticsRoute("#/track", "/"), "/track");
  assert.equal(safeCustomerAnalyticsRoute("", "/customer-mobile/"), "/customer-mobile");
  assert.equal(safeCustomerAnalyticsRoute("", "/private-identity/12345"), "/unknown");
  assert.equal(safeCustomerAnalyticsRoute("#/orders/customer-id", "/"), "/");
});

test("custom properties reject PII, invalid codes, raw routes and nested values", () => {
  assert.deepEqual(sanitizeCustomerAnalyticsProperties({
    outcome: "success", reason_code: "route_preview_unavailable", email: "private@example.com",
    phone: "0911223344", payload: { access_token: TOKEN },
    route: "/access_token=" + TOKEN, password: TOKEN, source: [TOKEN],
    release: "08f546007808a28053b968377761f6c4cbaa7eb2",
  }), {
    outcome: "success", reason_code: "route_preview_unavailable",
    release: "08f546007808a28053b968377761f6c4cbaa7eb2",
  });
});

test("before_send drops secrets from SDK properties and does not forward nested payloads", () => {
  const route = safeCustomerAnalyticsRoute("#access_token=" + TOKEN, hostedPath);
  const url = safeCustomerAnalyticsUrl(origin, route);
  const clean = sanitizeCustomerPostHogEvent({
    event: "$pageview", uuid: "550e8400-e29b-41d4-a716-446655440000",
    properties: {
      route: "/access_token=" + TOKEN,
      $pathname: "/access_token=" + TOKEN,
      $current_url: origin + "/hallotruck/customer-mobile/#access_token=" + TOKEN,
      $referrer: origin + "/?refresh_token=" + TOKEN,
      $host: "secret-host", $search: "?password=secret", $hash: "#" + TOKEN,
      email: "secret@example.com", phone: "0911223344",
      nested: { access_token: TOKEN },
      environment: "production", device_class: "mobile",
      $lib: "web", distinct_id: "550e8400-e29b-41d4-a716-446655440000",
      $session_id: "550e8400-e29b-41d4-a716-446655440000",
    },
    $set: { access_token: TOKEN },
  }, route, url);
  assert.ok(clean);
  const json = JSON.stringify(clean);
  for (const secret of [TOKEN, "access_token", "refresh_token", "password=secret", "secret@example.com", "0911223344", "secret-host"]) {
    assert.equal(json.includes(secret), false, secret);
  }
  assert.equal(clean.properties.route, "/hallotruck/customer-mobile");
  assert.equal(clean.properties.$current_url, origin + "/#/hallotruck/customer-mobile");
  assert.equal(clean.properties.$session_id, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(clean.properties.distinct_id, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(clean.properties.environment, "production");
  assert.equal("$set" in clean, false);
});

test("unknown events and automatic capture are rejected", () => {
  for (const event of ["$exception", "$snapshot", "$autocapture", "free_text", "order_" + TOKEN]) {
    assert.equal(sanitizeCustomerPostHogEvent({ event, properties: { token: TOKEN } }, "/", origin + "/#/"), null);
  }
  const ok = sanitizeCustomerPostHogEvent({
    event: "order_placed", properties: { outcome: "success", phone: "0911223344" },
  }, "/orders", origin + "/#/orders");
  assert.equal(ok.properties.outcome, "success");
  assert.equal(JSON.stringify(ok).includes("0911223344"), false);
});


test("metadata values are a finite vocabulary, not arbitrary short identifiers", () => {
  const sanitized = sanitizeCustomerAnalyticsProperties({
    role: "customer",
    environment: "production",
    workflow: "customer_booking",
    reason_code: "route_preview_unavailable",
    source: "email_login",
    device_class: "mobile",
    payment_method: "cash",
    order_state: "placed",
    outcome: "success",
    error_code: "unknown_error",
    organization_type: "individual",
  });
  assert.deepEqual(sanitized, {
    role: "customer",
    environment: "production",
    workflow: "customer_booking",
    reason_code: "route_preview_unavailable",
    source: "email_login",
    device_class: "mobile",
    payment_method: "cash",
    order_state: "placed",
    outcome: "success",
    error_code: "unknown_error",
    organization_type: "individual",
  });
  for (const key of [
    "role", "environment", "workflow", "reason_code", "source",
    "device_class", "payment_method", "order_state", "outcome",
    "error_code", "organization_type",
  ]) {
    for (const value of ["john_doe", "private_email", "private_token", "0911223344", "alice", "user_1234"]) {
      assert.deepEqual(sanitizeCustomerAnalyticsProperties({ [key]: value }), {}, key + " " + value);
    }
  }
  assert.deepEqual(sanitizeCustomerAnalyticsProperties({ release: "my-secret-build" }), {});
  assert.deepEqual(sanitizeCustomerAnalyticsProperties({ outcome: true, role: 22 }), {});
});

test("before_send cannot reinstate PII through curated custom metadata properties", () => {
  const event = sanitizeCustomerPostHogEvent({
    event: "login_failed",
    properties: {
      outcome: "failed",
      role: "user_1234",
      reason_code: "customer_email",
      source: "john_doe",
      environment: "production",
      $current_url: "https://example.org/?access_token=secret",
    },
  }, "/login", safeCustomerAnalyticsUrl(origin, "/login"));
  assert.ok(event);
  assert.equal(event.properties.outcome, "failed");
  assert.equal(event.properties.environment, "production");
  assert.equal("role" in event.properties, false);
  assert.equal("reason_code" in event.properties, false);
  assert.equal("source" in event.properties, false);
  assert.equal(JSON.stringify(event).includes("secret"), false);
});


test("trusted static SPA pageview routes are retained without accepting raw query, hash or identifiers", () => {
  const base = "/hallotruck/customer-mobile";
  const rawUrl = safeCustomerAnalyticsUrl(origin, base);
  const make = (route) => sanitizeCustomerPostHogEvent({
    event: "$pageview",
    properties: {
      route,
      $current_url: origin + "/#access_token=" + TOKEN,
      $pathname: "/private/" + TOKEN,
    },
  }, base, rawUrl);
  const orders = make("/orders");
  assert.equal(orders.properties.route, "/orders");
  assert.equal(orders.properties.$pathname, "/orders");
  assert.equal(orders.properties.$current_url, origin + "/#/orders");
  for (const raw of [
    "#access_token=" + TOKEN, "/orders?access_token=" + TOKEN,
    "/orders/" + TOKEN, "/orders#refresh_token=" + TOKEN,
    "https://example.test/orders", "/unknown", "/order/55",
  ]) {
    const clean = make(raw);
    assert.equal(clean.properties.route, base);
    assert.equal(JSON.stringify(clean).includes(TOKEN), false);
  }
});


test("SDK metadata is fail-closed against token-like strings even under allowed keys", () => {
  const secret = "syntheticTokenBearerValueAcrossAllowedTransportFields1234567";
  const leaked = sanitizeCustomerPostHogEvent({
    event: "$pageview",
    uuid: secret,
    properties: {
      distinct_id: secret,
      $session_id: secret,
      $window_id: secret,
      $insert_id: secret,
      $device_id: secret,
      $lib: secret,
      $browser: secret,
      $os: secret,
      $device_type: secret,
      $lib_version: secret,
      environment: "production",
    },
  }, "/login", safeCustomerAnalyticsUrl(origin, "/login"));
  assert.ok(leaked);
  assert.equal(JSON.stringify(leaked).includes(secret), false);
  for (const key of ["distinct_id", "$session_id", "$window_id", "$insert_id", "$device_id",
    "$lib", "$browser", "$os", "$device_type", "$lib_version"]) {
    assert.equal(key in leaked.properties, false, key);
  }
  assert.equal("uuid" in leaked, false);
  assert.equal(leaked.properties.environment, "production");
});

test("safe SDK UUID and finite descriptive metadata survive privacy boundary", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const clean = sanitizeCustomerPostHogEvent({
    event: "$pageview",
    uuid,
    properties: {
      distinct_id: uuid,
      $session_id: uuid,
      $device_id: uuid,
      $lib: "web",
      $lib_version: "1.223.0",
      $browser: "Mobile Safari",
      $os: "iOS",
      $device_type: "Mobile",
      $screen_width: 390,
    },
  }, "/login", safeCustomerAnalyticsUrl(origin, "/login"));
  assert.ok(clean);
  assert.equal(clean.uuid, uuid);
  assert.equal(clean.properties.distinct_id, uuid);
  assert.equal(clean.properties.$session_id, uuid);
  assert.equal(clean.properties.$lib, "web");
  assert.equal(clean.properties.$lib_version, "1.223.0");
  assert.equal(clean.properties.$browser, "Mobile Safari");
  assert.equal(clean.properties.$os, "iOS");
  assert.equal(clean.properties.$device_type, "Mobile");
  assert.equal(clean.properties.$screen_width, 390);
});
