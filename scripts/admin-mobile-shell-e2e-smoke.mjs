import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4198;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const vite = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuild = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const temp = path.join(root, ".admin-mobile-shell-e2e");
const entry = path.join(temp, "entry.mjs");
const bundle = path.join(root, "dist", "admin-mobile-shell-e2e.js");
const html = path.join(root, "dist", "admin-mobile-shell-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Admin mobile shell preview did not start in time.");
}

function render(chrome, width, profile) {
  const args = [
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
    `--window-size=${width},915`, "--virtual-time-budget=3500", `--user-data-dir=${profile}`,
    "--dump-dom", `${baseUrl}admin-mobile-shell-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin mobile shell at ${width}px.`);
}

await mkdir(temp, { recursive: true });
const css = (await readdir(path.join(root, "dist", "assets"))).find((name) => /^index-.*\.css$/.test(name));
if (!css) throw new Error("Built application CSS not found.");

const fixture = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AdminToolShell } from ${JSON.stringify(path.join(root, "src", "components", "admin", "AdminToolShell.tsx"))};

createRoot(document.getElementById("root")).render(
  React.createElement(MemoryRouter, { initialEntries: ["/admin/finance"] },
    React.createElement(AdminToolShell, null,
      React.createElement("main", { className: "min-w-0 max-w-full p-3" },
        React.createElement("h1", null, "Admin mobile shell fixture"),
        React.createElement("p", { className: "break-all" }, "TRACKING-" + "X".repeat(240))
      )
    )
  )
);
await new Promise((resolve) => setTimeout(resolve, 250));
const open = document.querySelector('button[aria-label="Open Admin menu"]');
open?.click();
await new Promise((resolve) => setTimeout(resolve, 350));
const menu = document.getElementById("admin-tool-menu");
const close = document.querySelector('button[aria-label="Close Admin menu"]');
const openRect = open?.getBoundingClientRect();
const closeRect = close?.getBoundingClientRect();
const menuRect = menu?.getBoundingClientRect();
const current = menu?.querySelectorAll('[aria-current="page"]').length ?? 0;
document.documentElement.dataset.ready = "true";
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth ||
  document.body.scrollWidth > document.body.clientWidth
);
document.documentElement.dataset.openTouch = String(Boolean(openRect && openRect.width >= 44 && openRect.height >= 44));
document.documentElement.dataset.closeTouch = String(Boolean(closeRect && closeRect.width >= 44 && closeRect.height >= 44));
document.documentElement.dataset.drawerFits = String(Boolean(menuRect && menuRect.width <= window.innerWidth - 16));
document.documentElement.dataset.expanded = open?.getAttribute("aria-expanded") ?? "missing";
document.documentElement.dataset.controls = open?.getAttribute("aria-controls") ?? "missing";
document.documentElement.dataset.financeLink = String(Boolean(menu?.querySelector('a[href="/admin/finance"]')));
document.documentElement.dataset.current = String(current);
`;

await writeFile(entry, fixture, "utf8");
const built = spawnSync(esbuild, [
  entry, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundle}`,
  "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
  "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
], { cwd: root, encoding: "utf8" });
if (built.status !== 0) throw new Error(built.stderr || "Admin mobile shell fixture bundle failed.");
await writeFile(html, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${css}"></head><body><div id="root"></div><script type="module" src="./admin-mobile-shell-e2e.js"></script></body></html>`, "utf8");

const preview = spawn(vite, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer();
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-mobile-shell-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-ready="true"', 'data-overflow="false"', 'data-open-touch="true"',
        'data-close-touch="true"', 'data-drawer-fits="true"', 'data-expanded="true"',
        'data-controls="admin-tool-menu"', 'data-finance-link="true"', "Admin mobile shell fixture",
      ]) {
        if (!dom.includes(expected)) throw new Error(`Admin mobile shell ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
  console.log("Admin mobile shell browser smoke passed at 320px, 360px, 390px and 412px with drawer containment, 44px controls and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(temp, { recursive: true, force: true }), rm(bundle, { force: true }), rm(html, { force: true })]);
}
