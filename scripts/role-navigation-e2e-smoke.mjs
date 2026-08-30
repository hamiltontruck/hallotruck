import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4186;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".role-navigation-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "role-navigation-e2e.js");
const htmlFile = path.join(root, "dist", "role-navigation-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, height, profile, mode, route) {
  const target = `${baseUrl}role-navigation-e2e.html?mode=${mode}&route=${encodeURIComponent(route)}`;
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},${height}`, "--virtual-time-budget=3000", `--user-data-dir=${profile}`, "--dump-dom", target];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 15 * 1024 * 1024, timeout: 30000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render ${mode} navigation at ${width}x${height}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src", "i18n", "LanguageProvider.tsx"))};
import { CustomerBottomNav } from ${JSON.stringify(path.join(root, "src", "components", "customer", "CustomerBottomNav.tsx"))};
import { DriverBottomNav } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverBottomNav.tsx"))};
import { AdminMobileBottomNav } from ${JSON.stringify(path.join(root, "src", "components", "admin", "AdminMobileBottomNav.tsx"))};
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'customer';
const route = params.get('route') || '/customer';
const Component = mode === 'admin' ? AdminMobileBottomNav : mode === 'driver' ? DriverBottomNav : CustomerBottomNav;
createRoot(document.getElementById('root')).render(
  React.createElement(LanguageProvider, null,
    React.createElement(MemoryRouter, { initialEntries: [route] },
      React.createElement('main', { style: { minHeight: '120vh', width: '100%' } }, React.createElement(Component))
    )
  )
);
await new Promise((resolve) => setTimeout(resolve, 200));
const nav = document.querySelector('nav');
const items = nav ? [...nav.querySelectorAll('a')] : [];
const navDisplay = nav ? getComputedStyle(nav).display : 'missing';
document.documentElement.dataset.mode = mode;
document.documentElement.dataset.items = String(items.length);
document.documentElement.dataset.active = String(items.filter((item) => item.getAttribute('aria-current') === 'page' || item.classList.contains('is-active')).length);
document.documentElement.dataset.bottom = nav ? getComputedStyle(nav).bottom : 'missing';
document.documentElement.dataset.display = navDisplay;
document.documentElement.dataset.visible = String(navDisplay !== 'none' && navDisplay !== 'missing');
document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
document.documentElement.dataset.ready = 'true';
`;

await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Role navigation fixture bundle failed.");
await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./role-navigation-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  const cases = [
    ["customer", "/customer/track", ["Home", "Orders", "Track", "Payments", "Profile"]],
    ["driver", "/driver/profile", ["Home", "Jobs", "Trip", "Wallet", "Profile"]],
    ["admin", "/admin/operations?section=Fleet%20%26%20drivers", ["Overview", "Orders", "Fleet", "Finance", "More"]],
  ];
  for (const width of [320, 360, 390, 412]) {
    for (const [mode, route, labels] of cases) {
      const profile = await mkdtemp(path.join(os.tmpdir(), `hallotruck-${mode}-nav-`));
      try {
        const dom = render(chrome, width, 915, profile, mode, route);
        for (const expected of ['data-ready="true"', 'data-items="5"', 'data-active="1"', 'data-bottom="0px"', 'data-visible="true"', 'data-overflow="false"', ...labels]) {
          if (!dom.includes(expected)) throw new Error(`${mode} navigation ${width}px smoke missing: ${expected}`);
        }
      } finally { await rm(profile, { recursive: true, force: true }); }
    }
  }

  for (const [mode, route] of cases) {
    const profile = await mkdtemp(path.join(os.tmpdir(), `hallotruck-${mode}-keyboard-nav-`));
    try {
      const dom = render(chrome, 390, 480, profile, mode, route);
      for (const expected of ['data-ready="true"', 'data-display="none"', 'data-visible="false"', 'data-overflow="false"']) {
        if (!dom.includes(expected)) throw new Error(`${mode} keyboard-safe navigation smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }

  console.log("Role navigation browser smoke passed at 320px, 360px, 390px and 412px, with canonical Driver Profile routing and keyboard-safe fixed navigation.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
