import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4196;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-driver-chat-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-driver-chat-e2e.js");
const htmlFile = path.join(root, "dist", "admin-driver-chat-e2e.html");

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
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry while Vite starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profile) {
  const args = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--window-size=${width},900`,
    "--virtual-time-budget=2500",
    `--user-data-dir=${profile}`,
    "--dump-dom",
    `${baseUrl}admin-driver-chat-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin Driver chat at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { ChatConversation } from ${JSON.stringify(path.join(root, "src", "components", "chat", "ChatConversation.tsx"))};

const messages = [
  { id: "m1", thread_id: "thread-1", sender_id: "driver-1", body: "I reached the pickup point and I am ready for loading.", message_kind: "text", order_id: null, client_message_id: "c1", created_at: "2026-09-02T03:55:00.000Z" },
  { id: "m2", thread_id: "thread-1", sender_id: "admin-1", body: "Confirmed. Continue with the assigned order and update Operations before departure.", message_kind: "order_context", order_id: "order-1", client_message_id: "c2", created_at: "2026-09-02T03:56:00.000Z" },
];
const orders = [
  { id: "order-1", tracking_id: "HT-2026-CHAT01", status: "accepted", pickup_address: "Addis Ababa", dropoff_address: "Adama", created_at: "2026-09-02T03:40:00.000Z" },
];

createRoot(document.getElementById("root")).render(
  React.createElement("main", { className: "h-[900px] min-h-0 w-full max-w-full overflow-hidden bg-[#f7f6f1]" },
    React.createElement(ChatConversation, {
      title: "Abiyu Driver",
      subtitle: "+251900000000 · HALLO Driver operations",
      participantBadge: "approved",
      messages,
      orders,
      currentUserId: "admin-1",
      peerReadAt: "2026-09-02T03:57:00.000Z",
      quickReplies: ["Confirm your current status.", "Call Operations when it is safe."],
      sending: false,
      loading: false,
      error: "",
      onSend: async () => {},
    })
  )
);
await new Promise((resolve) => setTimeout(resolve, 250));
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth ||
  document.body.scrollWidth > document.body.clientWidth
);
document.documentElement.dataset.chatReady = String(Boolean(
  document.body.textContent?.includes("Abiyu Driver") &&
  document.body.textContent?.includes("Secure") &&
  document.body.textContent?.includes("HT-2026-CHAT01") &&
  document.body.textContent?.includes("Seen ✓✓") &&
  document.body.textContent?.includes("Order context") &&
  document.body.textContent?.includes("Confirm your current status.") &&
  document.body.textContent?.includes("Enter sends")
));
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
if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin Driver chat fixture bundle failed.");

await writeFile(
  htmlFile,
  `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-driver-chat-e2e.js"></script></body></html>`,
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
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-driver-chat-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-chat-ready="true"',
        'data-overflow="false"',
        "Abiyu Driver",
        "Secure",
        "HT-2026-CHAT01",
        "Seen ✓✓",
        "Order context",
        "Confirm your current status.",
        "Enter sends",
      ]) {
        if (!dom.includes(expected)) throw new Error(`Admin Driver chat ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Admin Driver modern chat browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with read receipts, order context, quick replies and no horizontal overflow.");
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
