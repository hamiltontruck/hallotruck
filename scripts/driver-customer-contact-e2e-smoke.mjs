import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4193;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const testDirectory = path.join(root, ".driver-customer-contact-e2e");
const bundleFile = path.join(root, "dist", "driver-customer-contact-e2e.js");
const htmlFile = path.join(root, "dist", "driver-customer-contact-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* preview is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

async function render(chrome, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-customer-contact-e2e-"));
  try {
    const result = spawnSync(chrome, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=7000", `--user-data-dir=${profile}`, "--dump-dom",
      `${baseUrl}driver-customer-contact-e2e.html`,
    ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
    return result.stdout;
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

async function prepareFixture() {
  await mkdir(testDirectory, { recursive: true });
  const assets = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assets.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found.");

  const source = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src/i18n/LanguageProvider.tsx"))};
import { DriverCustomerContact } from ${JSON.stringify(path.join(root, "src/components/driver/DriverCustomerContact.tsx"))};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(predicate, timeoutMs = 800) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return true;
    await delay(10);
  }
  return Boolean(predicate());
}

let orderTwoAttempts = 0;
let resolveOrderTwoRetry;

function primaryLoader(orderId) {
  if (orderId === "order-1") {
    return new Promise((resolve) => setTimeout(() => resolve({
      customer_name: "Alice First Customer",
      customer_phone: "+251 911 111 111",
    }), 20));
  }

  orderTwoAttempts += 1;
  if (orderTwoAttempts === 1) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("temporary network failure")), 70));
  }

  return new Promise((resolve) => {
    resolveOrderTwoRetry = resolve;
  });
}

function invalidPhoneLoader() {
  return Promise.resolve({ customer_name: "Invalid Phone Customer", customer_phone: "N/A" });
}

function Fixture() {
  const [orderId, setOrderId] = useState("order-1");
  return React.createElement("main", { className: "mx-auto max-w-2xl px-3 py-4" },
    React.createElement("button", {
      type: "button",
      "data-switch-order": "true",
      onClick: () => setOrderId("order-2"),
    }, "Switch assigned order"),
    React.createElement("div", { id: "primary" },
      React.createElement(DriverCustomerContact, { orderId, loadContact: primaryLoader })
    ),
    React.createElement("div", { id: "invalid" },
      React.createElement(DriverCustomerContact, { orderId: "invalid-order", loadContact: invalidPhoneLoader })
    )
  );
}

document.documentElement.dataset.fixtureBooted = "true";
createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null, React.createElement(Fixture))
);

async function verify() {
  await waitUntil(() => Boolean(
    document.querySelector('#primary a[href="tel:+251911111111"]')
    && (document.querySelector("#primary")?.textContent ?? "").includes("Alice First Customer")
    && document.querySelector('#invalid section[data-contact-state="ready"]')
  ));
  const initialLink = document.querySelector('#primary a[href="tel:+251911111111"]');
  const initialText = document.querySelector("#primary")?.textContent ?? "";
  const initialReady = Boolean(initialLink && initialText.includes("Alice First Customer"));

  document.querySelector("[data-switch-order]")?.click();
  await waitUntil(() => Boolean(document.querySelector('#primary section[data-contact-state="loading"]')));
  const loadingSection = document.querySelector('#primary section[data-contact-state="loading"]');
  const loadingText = document.querySelector("#primary")?.textContent ?? "";
  const staleCleared = Boolean(
    loadingSection?.getAttribute("aria-busy") === "true"
    && !document.querySelector('#primary a[href="tel:+251911111111"]')
    && !loadingText.includes("Alice First Customer")
    && !loadingText.includes("+251 911 111 111")
  );

  await waitUntil(() => Boolean(document.querySelector('#primary section[data-contact-state="error"]')));
  const errorSection = document.querySelector('#primary section[data-contact-state="error"]');
  const retryButton = errorSection?.querySelector("button");
  const errorRetry = Boolean(errorSection && retryButton && errorSection.querySelector('[role="alert"]') && !errorSection.querySelector('a[href^="tel:"]'));

  retryButton?.click();
  retryButton?.click();
  await waitUntil(() => orderTwoAttempts === 2 && Boolean(document.querySelector('#primary section[data-contact-state="loading"]')));
  const retryLoading = document.querySelector('#primary section[data-contact-state="loading"]');
  const retryCalls = orderTwoAttempts === 2;
  const retryLocked = Boolean(retryLoading?.getAttribute("aria-busy") === "true" && !document.querySelector("#primary button") && !document.querySelector('#primary a[href^="tel:"]'));

  resolveOrderTwoRetry?.({
    customer_name: "Bob Current Customer",
    customer_phone: "+251 922 222 222",
  });
  await waitUntil(() => Boolean(
    document.querySelector('#primary a[href="tel:+251922222222"]')
    && (document.querySelector("#primary")?.textContent ?? "").includes("Bob Current Customer")
  ));
  const finalLink = document.querySelector('#primary a[href="tel:+251922222222"]');
  const finalText = document.querySelector("#primary")?.textContent ?? "";
  const finalReady = Boolean(
    finalLink
    && finalText.includes("Bob Current Customer")
    && !finalText.includes("Alice First Customer")
    && !document.querySelector('#primary a[href="tel:+251911111111"]')
  );

  const invalidText = document.querySelector("#invalid")?.textContent ?? "";
  const invalidLink = Boolean(!document.querySelector('#invalid a[href^="tel:"]') && invalidText.includes("Customer phone is not available."));
  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth;

  document.documentElement.dataset.initialReady = String(initialReady);
  document.documentElement.dataset.staleCleared = String(staleCleared);
  document.documentElement.dataset.errorRetry = String(errorRetry);
  document.documentElement.dataset.retryCalls = String(retryCalls);
  document.documentElement.dataset.retryLocked = String(retryLocked);
  document.documentElement.dataset.finalReady = String(finalReady);
  document.documentElement.dataset.invalidLink = String(invalidLink);
  document.documentElement.dataset.overflow = String(overflow);
  document.documentElement.dataset.ready = "true";
}

window.addEventListener("error", (event) => {
  document.documentElement.dataset.fixtureError = event.error?.message || event.message || "runtime error";
  document.documentElement.dataset.ready = "true";
});
window.addEventListener("unhandledrejection", (event) => {
  document.documentElement.dataset.fixtureError = event.reason?.message || String(event.reason);
  document.documentElement.dataset.ready = "true";
});

void verify().catch((error) => {
  document.documentElement.dataset.fixtureError = error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.ready = "true";
});
`;

  const entry = path.join(testDirectory, "entry.mjs");
  await writeFile(entry, source, "utf8");
  const bundled = spawnSync(bin("esbuild"), [
    entry,
    "--bundle",
    "--platform=browser",
    "--format=esm",
    "--target=chrome120",
    `--outfile=${bundleFile}`,
    "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
    "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
  ], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver customer contact fixture bundle failed.");

  await writeFile(
    htmlFile,
    `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-customer-contact-e2e.js"></script></body></html>`,
    "utf8",
  );
}

await prepareFixture();
const preview = spawn(bin("vite"), ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const dom = await render(chrome, { width, height: 1200 });
    for (const expected of [
      'data-fixture-booted="true"',
      'data-ready="true"',
      'data-initial-ready="true"',
      'data-stale-cleared="true"',
      'data-error-retry="true"',
      'data-retry-calls="true"',
      'data-retry-locked="true"',
      'data-final-ready="true"',
      'data-invalid-link="true"',
      'data-overflow="false"',
    ]) {
      if (!dom.includes(expected)) throw new Error(`Driver customer contact ${width}px smoke is missing: ${expected}`);
    }
    if (dom.includes("data-fixture-error=")) throw new Error(`Driver customer contact ${width}px fixture reported an error.`);
  }
  console.log("Driver customer contact browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with deterministic readiness, stale-contact removal, one guarded retry, valid-phone-only calling and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([
    rm(testDirectory, { recursive: true, force: true }),
    rm(bundleFile, { force: true }),
    rm(htmlFile, { force: true }),
  ]);
}
