import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4193;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-manage-order-action-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-manage-order-action-e2e.js");
const htmlFile = path.join(root, "dist", "admin-manage-order-action-e2e.html");

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
  throw new Error("Admin manage-order action preview did not start in time.");
}

function render(chrome, width, profileDirectory) {
  const args = [
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-default-apps",
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    `--window-size=${width},900`, "--virtual-time-budget=5000",
    `--user-data-dir=${profileDirectory}`, "--dump-dom", `${baseUrl}admin-manage-order-action-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
      timeout: 30_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin manage-order actions at ${width}px.`);
}

function assertContains(dom, values, label) {
  for (const value of values) {
    if (!dom.includes(value)) throw new Error(`${label} is missing: ${value}`);
  }
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS was not found.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import {
  AdminManageOrderActionButton,
  AdminManageOrderActionStatus,
  manageOrderBusyGuidanceId,
} from ${JSON.stringify(path.join(root, "src", "components", "admin", "AdminManageOrderAction.tsx"))};

const actions = ["transit", "cancel", "delete", "assign", "delivery"];
const orderId = "order-guidance";

function App() {
  return React.createElement("main", { className: "min-h-screen bg-[#f5f3ed] p-3 sm:p-8" },
    React.createElement("h1", { className: "font-display text-2xl font-bold" }, "Manage order action states"),
    ...actions.map((action) => React.createElement("section", {
      key: action,
      className: "mt-4 min-w-0 border border-asphalt/10 bg-white p-4",
      "data-action": action,
    },
      React.createElement(AdminManageOrderActionStatus, { orderId: orderId + "-" + action, action }),
      React.createElement(AdminManageOrderActionButton, {
        orderId: orderId + "-" + action,
        action,
        activeAction: action,
        idleLabel: action + " action",
        busyLabel: action + " in progress",
        className: "mt-3 w-full bg-asphalt px-4 py-3 text-sm font-semibold text-white sm:w-auto",
        type: "button",
      }),
    )),
    React.createElement("section", { className: "mt-4 border border-asphalt/10 bg-white p-4", "data-action": "resource-lock" },
      React.createElement("p", { id: "assignment-resource-guidance", className: "text-xs text-route" }, "Assignment is locked because no available truck is eligible for this order."),
      React.createElement(AdminManageOrderActionButton, {
        orderId,
        action: "assign",
        activeAction: null,
        idleLabel: "Assign & accept",
        disabledReason: "Assignment is locked because no available truck is eligible for this order.",
        guidanceId: "assignment-resource-guidance",
        className: "mt-3 w-full bg-asphalt px-4 py-3 text-sm font-semibold text-white sm:w-auto",
        type: "button",
      }),
    ),
    React.createElement("section", { className: "mt-4 border border-asphalt/10 bg-white p-4", "data-action": "ready" },
      React.createElement(AdminManageOrderActionButton, {
        orderId,
        action: "assign",
        activeAction: null,
        idleLabel: "Assign & accept",
        title: "Assign truck and driver to this order",
        className: "w-full bg-asphalt px-4 py-3 text-sm font-semibold text-white sm:w-auto",
        type: "button",
      }),
    ),
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
await new Promise((resolve) => setTimeout(resolve, 100));
const busyButtons = [...document.querySelectorAll('[data-action]:not([data-action="resource-lock"]):not([data-action="ready"]) button')];
const busyDescriptionsValid = busyButtons.every((button) => {
  const describedBy = button.getAttribute("aria-describedby");
  return button.disabled && describedBy && document.getElementById(describedBy)?.getAttribute("role") === "status";
});
const resourceButton = document.querySelector('[data-action="resource-lock"] button');
const readyButton = document.querySelector('[data-action="ready"] button');
document.documentElement.dataset.busyDescriptions = String(busyDescriptionsValid);
document.documentElement.dataset.busyStatusCount = String(document.querySelectorAll('[role="status"]').length);
document.documentElement.dataset.resourceLock = String(Boolean(resourceButton?.disabled && resourceButton.getAttribute("aria-describedby") === "assignment-resource-guidance"));
document.documentElement.dataset.ready = String(Boolean(readyButton && !readyButton.disabled));
document.documentElement.dataset.guidanceId = manageOrderBusyGuidanceId(orderId + "-assign");
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth
    || document.body.scrollWidth > document.body.clientWidth,
);
`;

await writeFile(entryFile, fixtureSource, "utf8");
const bundled = spawnSync(esbuildBinary, [
  entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120",
  `--outfile=${bundleFile}`,
], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin manage-order action fixture bundle failed.");

await writeFile(
  htmlFile,
  `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-manage-order-action-e2e.js"></script></body></html>`,
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
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-manage-order-"));
    try {
      const dom = render(chrome, width, profile);
      assertContains(dom, [
        'data-busy-descriptions="true"',
        'data-busy-status-count="5"',
        'data-resource-lock="true"',
        'data-ready="true"',
        'data-overflow="false"',
        'data-guidance-id="manage-order-busy-guidance-order-guidance-assign"',
        "Starting transit. Other order actions are temporarily locked until this update finishes.",
        "Cancelling this order. Other order actions are temporarily locked until this update finishes.",
        "Deleting this order. Other order actions are temporarily locked until this update finishes.",
        "Assigning the truck and driver. Other order actions are temporarily locked until this update finishes.",
        "Uploading proof of delivery. Other order actions are temporarily locked until this update finishes.",
      ], `Admin manage-order action states ${width}px`);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Admin manage-order action browser smoke passed at 320px–430px and tablet width with visible busy guidance, accessible disabled reasons and no overflow.");
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
