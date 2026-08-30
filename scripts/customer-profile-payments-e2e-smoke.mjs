import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4187;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".customer-profile-payments-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "customer-profile-payments-e2e.js");
const htmlFile = path.join(root, "dist", "customer-profile-payments-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profile) {
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},980`, "--virtual-time-budget=4000", `--user-data-dir=${profile}`, "--dump-dom", `${baseUrl}customer-profile-payments-e2e.html`];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 15 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render customer profile/payments at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src", "i18n", "LanguageProvider.tsx"))};
import { CustomerProfilePanel } from ${JSON.stringify(path.join(root, "src", "components", "customer", "CustomerProfilePanel.tsx"))};
import { CustomerLocationControl } from ${JSON.stringify(path.join(root, "src", "components", "customer", "CustomerLocationControl.tsx"))};

let locationCalls = 0;
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition(success) {
      locationCalls += 1;
      success({ coords: { longitude: 38.7578, latitude: 9.03, accuracy: 12 } });
    },
  },
});

const profile = {
  id: "customer-1",
  full_name: "Sofi Husse",
  phone: "0911223344",
  email: "sofi@example.com",
  home_address: "Addis Ababa, Bole",
  customer_type: "business",
  company_name: "Sofi Trading PLC",
  created_at: new Date().toISOString(),
};

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null,
    React.createElement("main", { className: "min-h-screen bg-bone p-3" },
      React.createElement("div", { className: "customer-view-profile grid gap-4" },
        React.createElement(CustomerProfilePanel, { profile, onSaved: async () => {} }),
        React.createElement(CustomerLocationControl),
      ),
      React.createElement("div", { className: "customer-view-payments mt-4" },
        React.createElement("button", { className: "customer-new-order" }, "New order"),
        React.createElement("div", { className: "customer-kpis" },
          React.createElement("div", null, "Orders"),
          React.createElement("div", null, "Active"),
          React.createElement("div", null, "ETB 50,000 due"),
          React.createElement("div", null, "Delivered"),
        ),
        React.createElement("div", { className: "customer-order-filters" },
          React.createElement("button", null, "All"),
          React.createElement("button", { className: "is-active" }, "Payment"),
        ),
        React.createElement("div", { className: "customer-order-card__actions" },
          React.createElement("button", { className: "is-primary" }, "Track"),
          React.createElement("button", { className: "is-cancel" }, "Cancel"),
          React.createElement("button", { className: "is-secondary" }, "Invoice"),
        ),
      ),
    ),
  ),
);

await new Promise((resolve) => setTimeout(resolve, 250));
const before = locationCalls;
const share = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Share current location"));
share?.click();
await new Promise((resolve) => setTimeout(resolve, 100));
const payments = document.querySelector(".customer-view-payments");
const newOrder = payments?.querySelector(".customer-new-order");
const track = payments?.querySelector(".is-primary");
const cancel = payments?.querySelector(".is-cancel");
const kpis = [...(payments?.querySelectorAll(".customer-kpis > *") ?? [])];
const filters = [...(payments?.querySelectorAll(".customer-order-filters button") ?? [])];
document.documentElement.dataset.ready = "true";
document.documentElement.dataset.locationBefore = String(before);
document.documentElement.dataset.locationAfter = String(locationCalls);
document.documentElement.dataset.locationStored = String(Boolean(sessionStorage.getItem("hallotruck:customer-location")));
document.documentElement.dataset.newOrderHidden = String(newOrder ? getComputedStyle(newOrder).display === "none" : false);
document.documentElement.dataset.trackHidden = String(track ? getComputedStyle(track).display === "none" : false);
document.documentElement.dataset.cancelHidden = String(cancel ? getComputedStyle(cancel).display === "none" : false);
document.documentElement.dataset.visibleKpis = String(kpis.filter((item) => getComputedStyle(item).display !== "none").length);
document.documentElement.dataset.visibleFilters = String(filters.filter((item) => getComputedStyle(item).display !== "none").length);
document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
`;

await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Customer profile/payments fixture bundle failed.");
await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./customer-profile-payments-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-customer-profile-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-ready="true"',
        'data-location-before="0"',
        'data-location-after="1"',
        'data-location-stored="true"',
        'data-new-order-hidden="true"',
        'data-track-hidden="true"',
        'data-cancel-hidden="true"',
        'data-visible-kpis="1"',
        'data-visible-filters="1"',
        'data-overflow="false"',
        "Edit profile",
        "Share location only when you choose",
      ]) {
        if (!dom.includes(expected)) throw new Error(`Customer profile/payments ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Customer profile and payment workspace browser smoke passed at 320px, 360px, 390px and 412px with explicit location consent and payment-only actions.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
