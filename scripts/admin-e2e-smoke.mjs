import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4174;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Preview server returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error("Preview server did not start in time.");
}

function assertContains(dom, expected, label) {
  for (const value of expected) {
    if (!dom.includes(value)) throw new Error(`${label} is missing expected text: ${value}`);
  }
}

function dumpDom(chrome, url, profileDirectory, viewport) {
  const common = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=8000",
    `--user-data-dir=${profileDirectory}`,
    "--dump-dom",
    url,
  ];

  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [headlessFlag, ...common], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
    if (result.error?.code === "ETIMEDOUT") throw new Error(`Chrome timed out while opening ${url}`);
  }
  throw new Error(`Chrome could not render ${url}`);
}

async function render(chrome, route, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-e2e-"));
  try {
    return dumpDom(chrome, `${baseUrl}#${route}`, profile, viewport);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

let previewOutput = "";
preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  const routes = [
    "/admin",
    "/admin/driver-compliance",
    "/admin/driver-commission",
    "/admin/payment-review",
    "/admin/manual-driver-documents",
    "/admin/fleet-maintenance",
    "/admin/quote-pricing",
  ];

  for (const route of routes) {
    const mobile = await render(chrome, route, { width: 412, height: 915 });
    assertContains(mobile, ["Control Center", "Logistics built around every role."], `Admin mobile guard ${route}`);

    const desktop = await render(chrome, route, { width: 1440, height: 1000 });
    assertContains(desktop, ["Control Center", "Hamilton Truck Transportation"], `Admin desktop guard ${route}`);
  }

  console.log("Admin/Finance browser smoke passed: protected approval, assignment, payment review, commission/report and operational routes on mobile and desktop.");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
}
