import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

// Authenticated test-backend smoke. Supply files outside the repository; never
// commit session tokens or credentials. All Supabase traffic is routed to the
// explicitly marked isolated backend, including auth and read-only RPC requests.
const config = JSON.parse(await readFile(process.env.PARTNER_TEST_CONFIG, "utf8"));
const session = JSON.parse(await readFile(process.env.PARTNER_TEST_SESSION, "utf8"));
assert.equal(config.testOnly, true, "An explicitly isolated test backend is required");
const preview = new URL(process.env.PARTNER_PREVIEW_URL);
const mode = process.env.PARTNER_SMOKE_MODE ?? "positive";
const output = process.env.PARTNER_SMOKE_OUTPUT ?? "/tmp/partner-live-preview-smoke";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const width of [320, 360, 390, 412]) {
    const page = await browser.newPage({ viewport: { width, height: 915 } });
    await page.addInitScript((authSession) => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        return /^sb-.*-auth-token$/.test(key) ? JSON.stringify(authSession) : original.call(this, key);
      };
    }, session);
    await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
      const request = route.request();
      const original = new URL(request.url());
      const target = new URL(original.pathname + original.search, config.url);
      const allowedRpc = ["partner_login_access", "fleet_enterprise_vehicles", "fleet_enterprise_summary", "partner_get_live_trip"];
      if (request.method() !== "GET" && !(request.method() === "POST" && allowedRpc.some((name) => original.pathname.endsWith("/rpc/" + name)))) {
        await route.abort(); return;
      }
      const response = await route.fetch({ url: target.toString(), headers: { ...request.headers(), apikey: config.key, authorization: `Bearer ${session.access_token}` } });
      await route.fulfill({ response });
    });
    await page.goto(preview.toString(), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Real GPS fleet map" }).waitFor({ timeout: 30000 });
    await page.getByText("Loading real fleet telemetry…", { exact: true }).waitFor({ state: "hidden", timeout: 30000 });
    if (mode === "positive") {
      await page.locator("article").filter({ hasText: "LIVE" }).first().waitFor();
      assert.equal(await page.getByText("Live trip hidden:", { exact: true }).count(), 0);
    } else {
      await page.getByText("Live trip hidden:", { exact: true }).waitFor();
      assert.equal(await page.locator("article").count(), 0);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
    await page.screenshot({ path: `${output}/${mode}-${width}.png`, fullPage: true });
    console.log(`Authenticated Partner ${mode} preview ${width}px: PASS (isolated test backend)`);
    await page.close();
  }
} finally { await browser.close(); }
