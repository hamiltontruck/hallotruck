import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("Customer V4 PostHog initialization sanitizes an OAuth callback through the real before_send wiring", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/services/analytics.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    define: {
      "import.meta.env": JSON.stringify({
        MODE: "production",
        VITE_POSTHOG_PROJECT_TOKEN: "test-public-project-token",
        VITE_POSTHOG_HOST: "https://us.i.posthog.com",
        VITE_RELEASE_SHA: "a".repeat(40),
      }),
    },
  });
  const token = "synthetic.access-token.signature";
  const refresh = "synthetic-refresh-token";
  const location = {
    origin: "https://hamiltontruck.github.io",
    pathname: "/hallotruck/customer-mobile/",
    search: "?refresh_token=" + refresh,
    hash: "#access_token=" + token + "&refresh_token=" + refresh,
    href: "https://hamiltontruck.github.io/hallotruck/customer-mobile/?refresh_token=" + refresh + "#access_token=" + token,
  };
  const queuedScripts = [];
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  try {
    globalThis.window = {
      location,
      innerWidth: 390,
      addEventListener: () => {},
    };
    globalThis.document = {
      getElementById: () => null,
      createElement: () => ({}),
      head: { appendChild: (script) => queuedScripts.push(script) },
    };
    const source = bundle.outputFiles[0].text;
    const analytics = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
    assert.equal(analytics.initializeAnalytics(), true);
    assert.equal(queuedScripts.length, 1);

    const sdk = globalThis.window.posthog;
    const config = sdk._i?.[0]?.[1];
    assert.ok(config, "SDK configuration is queued");
    assert.equal(config.disable_session_recording, true);
    assert.equal(config.autocapture, false);
    assert.equal(config.capture_pageview, false);
    assert.equal(typeof config.before_send, "function");

    const pageviews = sdk.filter((entry) => entry?.[0] === "capture" && entry?.[1] === "$pageview");
    assert.equal(pageviews.length, 1);
    const rawPageview = { event: "$pageview", properties: {
      ...pageviews[0][2],
      $current_url: location.href,
      $pathname: location.hash,
      $referrer: "https://example.test/?access_token=" + token,
      $search: location.search,
      auth: { access_token: token },
    }};
    const cleanPageview = config.before_send(rawPageview);
    assert.equal(cleanPageview.properties.route, "/hallotruck/customer-mobile");
    assert.equal(cleanPageview.properties.$pathname, "/hallotruck/customer-mobile");
    assert.equal(cleanPageview.properties.$current_url, location.origin + "/#/hallotruck/customer-mobile");
    assert.equal(cleanPageview.properties.$referrer, "");

    analytics.captureAnalyticsVirtualPageview("/orders");
    const virtualPage = sdk.at(-1);
    assert.equal(virtualPage[0], "capture");
    assert.equal(virtualPage[1], "$pageview");
    const cleanVirtualPage = config.before_send({ event: virtualPage[1], properties: virtualPage[2] });
    assert.equal(cleanVirtualPage.properties.route, "/orders");
    assert.equal(cleanVirtualPage.properties.$pathname, "/orders");
    assert.equal(cleanVirtualPage.properties.$current_url, location.origin + "/#/orders");

    analytics.captureAnalyticsEvent("login_failed", {
      outcome: "failed",
      reason_code: "login_unavailable",
      source: "email_login",
      role: "private_user_id",
      email: "secret@example.test",
    });
    const last = sdk.at(-1);
    assert.equal(last[0], "capture");
    assert.equal(last[1], "login_failed");
    const cleanLogin = config.before_send({ event: last[1], properties: last[2] });
    assert.equal(cleanLogin.properties.outcome, "failed");
    assert.equal(cleanLogin.properties.source, "email_login");
    assert.equal("role" in cleanLogin.properties, false);
    assert.equal("email" in cleanLogin.properties, false);

    const payload = JSON.stringify([cleanPageview, cleanVirtualPage, cleanLogin]);
    for (const secret of [token, refresh, "access_token=", "refresh_token=", "private_user_id", "secret@example.test"]) {
      assert.equal(payload.includes(secret), false, secret);
    }
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
