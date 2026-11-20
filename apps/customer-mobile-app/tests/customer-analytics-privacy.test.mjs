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
    outcome: "success", reason_code: "route_not_found", email: "private@example.com",
    phone: "0911223344", payload: { access_token: TOKEN },
    route: "/access_token=" + TOKEN, password: TOKEN, source: [TOKEN],
    release: "08f546007808a28053b968377761f6c4cbaa7eb2",
  }), {
    outcome: "success", reason_code: "route_not_found",
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
