import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4194;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-create-order-action-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-create-order-action-e2e.js");
const htmlFile = path.join(root, "dist", "admin-create-order-action-e2e.html");

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
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Admin create-order action preview did not start in time.");
}

function render(chrome, width, profileDirectory) {
  const args = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--window-size=${width},1000`,
    "--virtual-time-budget=3000",
    `--user-data-dir=${profileDirectory}`,
    "--dump-dom",
    `${baseUrl}admin-create-order-action-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin create-order action at ${width}px.`);
}

function assertContains(dom, expected, label) {
  for (const value of expected) {
    if (!dom.includes(value)) throw new Error(`${label} is missing expected text: ${value}`);
  }
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built application CSS was not found in dist/assets.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { AdminCreateOrderAction } from ${JSON.stringify(path.join(root, "src", "components", "admin", "AdminCreateOrderAction.tsx"))};

const base = {
  createdTrackingId: "",
  saving: false,
  quoteLoading: false,
  routeReady: true,
  vehicleReady: true,
  cargoValidation: "",
  quoteAvailable: true,
  quoteError: "",
  quoteEtb: 50000,
};

const cases = [
  { id: "route", state: { ...base, routeReady: false, quoteAvailable: false, quoteEtb: null } },
  { id: "vehicle", state: { ...base, vehicleReady: false, quoteAvailable: false, quoteEtb: null } },
  { id: "cargo", state: { ...base, cargoValidation: "Truck 22 Ton supports up to 22 tons. Reduce the load or choose a larger vehicle.", quoteAvailable: false, quoteEtb: null } },
  { id: "loading", state: { ...base, quoteLoading: true, quoteAvailable: false, quoteEtb: null } },
  { id: "price", state: { ...base, quoteAvailable: false, quoteError: "Pricing service unavailable.", quoteEtb: null } },
  { id: "saving", state: { ...base, saving: true } },
  { id: "created", state: { ...base, createdTrackingId: "HT-2026-READY" } },
  { id: "ready", state: base },
];

createRoot(document.getElementById("root")).render(
  React.createElement("main", { className: "mx-auto grid min-w-0 max-w-3xl gap-3 p-3 sm:p-6" },
    cases.map(({ id, state }) => React.createElement("section", { key: id, "data-case": id, className: "min-w-0 border border-asphalt/10 bg-white p-3" },
      React.createElement("h2", { className: "font-semibold" }, id),
      React.createElement(AdminCreateOrderAction, state),
    )),
  ),
);

await new Promise((resolve) => setTimeout(resolve, 250));
const disabledButtons = [...document.querySelectorAll("button:disabled")];
const allButtons = [...document.querySelectorAll("button")];
const readyButton = document.querySelector('[data-case="ready"] button');
document.documentElement.dataset.disabledCount = String(disabledButtons.length);
document.documentElement.dataset.describedDisabled = String(disabledButtons.every((button) => {
  const id = button.getAttribute("aria-describedby");
  return Boolean(id && document.getElementById(id) && button.getAttribute("title"));
}));
document.documentElement.dataset.uniqueGuidance = String(new Set(allButtons.map((button) => button.getAttribute("aria-describedby"))).size === allButtons.length);
document.documentElement.dataset.readyEnabled = String(Boolean(readyButton && !readyButton.disabled));
document.documentElement.dataset.readyTitle = readyButton?.getAttribute("title") ?? "";
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth
    || document.body.scrollWidth > document.body.clientWidth,
);
document.documentElement.dataset.ready = "true";
`;

await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [
  entryFile,
  "--bundle",
  "--platform=browser",
  "--format=esm",
  "--target=chrome120",
  `--outfile=${bundleFile}`,
], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin create-order action fixture bundle failed.");

await writeFile(
  htmlFile,
  `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-create-order-action-e2e.js"></script></body></html>`,
  "utf8",
);

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-create-order-action-"));
    try {
      const dom = render(chrome, width, profile);
      assertContains(dom, [
        'data-ready="true"',
        'data-disabled-count="7"',
        'data-described-disabled="true"',
        'data-unique-guidance="true"',
        'data-ready-enabled="true"',
        'data-ready-title="Create order with the latest server price"',
        'data-overflow="false"',
        "Select pickup and drop-off places and wait for the road distance.",
        "Select a vehicle type.",
        "Truck 22 Ton supports up to 22 tons. Reduce the load or choose a larger vehicle.",
        "Waiting for the latest server price.",
        "Latest server price is unavailable: Pricing service unavailable.",
        "Creating this order. Wait for the save to finish.",
        "Order HT-2026-READY was already created. Close this form before starting another order.",
        "Order details are complete. The latest server quote is ETB 50,000.",
        "Create order · ETB 50,000",
      ], `Admin create-order action ${width}px smoke`);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Admin create-order action browser smoke passed at 320px–430px and 768px with explained lock states, an enabled ready state and no overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([
    rm(testDirectory, { recursive: true, force: true }),
    rm(bundleFile, { force: true }),
    rm(htmlFile, { force: true }),
  ]);
}
