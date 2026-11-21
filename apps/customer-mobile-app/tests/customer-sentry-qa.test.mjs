import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

async function loadPrivacyModule() {
  const result = await build({
    stdin: {
      contents: source("src/services/customer-sentry-privacy.ts"),
      sourcefile: "customer-sentry-privacy.ts",
      loader: "ts",
    },
    write: false,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  const dataUrl = "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(dataUrl);
}

test("Customer V4 Sentry is opt-in for QA and staging only", () => {
  const main = source("src/main.tsx");
  const init = source("src/services/customer-sentry.ts");
  const pkg = JSON.parse(source("package.json"));
  assert.match(main, /initializeCustomerSentry\(\)/);
  assert.match(main, /<Sentry\.ErrorBoundary/);
  assert.equal(pkg.dependencies["@sentry/react"], "^10.70.0");
  assert.match(init, /VITE_CUSTOMER_SENTRY_ENABLED/);
  assert.match(init, /VITE_CUSTOMER_SENTRY_ENVIRONMENT/);
  assert.match(init, /VITE_CUSTOMER_SENTRY_DSN/);
  assert.match(init, /import\.meta\.env\.PROD/);
  assert.match(init, /env === "qa" \|\| env === "staging"/);
  assert.match(init, /defaultIntegrations: false/);
  assert.match(init, /sendDefaultPii: false/);
  assert.match(init, /maxBreadcrumbs: 0/);
  assert.match(init, /tracesSampleRate: 0/);
  assert.match(init, /replaysSessionSampleRate: 0/);
  assert.match(init, /replaysOnErrorSampleRate: 0/);
  assert.doesNotMatch(init, /SENTRY_AUTH_TOKEN/);
});

test("Sentry sanitizer rejects raw OAuth, credentials, GPS and personal information", async () => {
  const { sanitizeCustomerSentryEvent } = await loadPrivacyModule();
  const secret = "qa-private-token-example-987654";
  const raw = {
    event_id: "a".repeat(32),
    message: secret,
    user: { email: "qa@example.org", ip_address: "192.0.2.10" },
    request: { url: "https://example.org/#access_token=" + secret },
    breadcrumbs: [{ message: "PIN=123456" }],
    extra: { password: "123456", gps: "9.0,38.7" },
    tags: { customer_id: secret },
    contexts: { customer: { phone: "+251912345678" } },
    exception: {
      values: [{
        type: "TypeError",
        value: "refresh_token=" + secret,
        stacktrace: { frames: [{
          filename: "https://example.org/?email=qa@example.org#access_token=" + secret,
          function: secret,
          vars: { pin: "123456" },
          lineno: 128,
          colno: 5,
        }] },
      }],
    },
  };
  const clean = sanitizeCustomerSentryEvent(raw);
  assert.equal(clean.exception.values[0].type, "TypeError");
  assert.equal(clean.exception.values[0].value, "Customer V4 unexpected exception");
  assert.deepEqual(clean.exception.values[0].stacktrace.frames, [{
    filename: "customer-v4.bundle.js",
    lineno: 128,
    colno: 5,
  }]);
  const json = JSON.stringify(clean);
  for (const sensitive of [secret, "123456", "qa@example.org", "192.0.2.10",
    "+251912345678", "9.0,38.7", "access_token", "refresh_token"]) {
    assert.equal(json.includes(sensitive), false, "leaked value: " + sensitive);
  }
  assert.equal(clean.user, undefined);
  assert.equal(clean.request, undefined);
  assert.equal(clean.breadcrumbs, undefined);
  assert.equal(clean.contexts, undefined);
  assert.equal(clean.extra, undefined);
});

test("Sentry sanitizer fails closed for arbitrary messages and malformed fields", async () => {
  const { sanitizeCustomerSentryEvent } = await loadPrivacyModule();
  assert.equal(sanitizeCustomerSentryEvent({ message: "secret" }), null);
  const clean = sanitizeCustomerSentryEvent({
    event_id: "unsafe-id-email@example.org",
    exception: { values: [{ type: "person@example.org", value: "pin=123456",
      stacktrace: { frames: [{ filename: "oauth?token=xyz",
        lineno: -1, colno: 900000000 }] } }] },
  });
  assert.equal(clean.event_id, undefined);
  assert.equal(clean.exception.values[0].type, "ApplicationError");
  assert.equal(clean.exception.values[0].stacktrace, undefined);
  assert.equal(JSON.stringify(clean).includes("person@example.org"), false);
});
