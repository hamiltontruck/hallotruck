import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4191;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const testDirectory = path.join(root, ".trip-completion-e2e");
const bundleFile = path.join(root, "dist", "trip-completion-e2e.js");
const htmlFile = path.join(root, "dist", "trip-completion-e2e.html");

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
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-trip-completion-e2e-"));
  try {
    const result = spawnSync(chrome, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--hide-scrollbars",
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=3000", `--user-data-dir=${profile}`, "--dump-dom",
      `${baseUrl}trip-completion-e2e.html`,
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
import React from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src/i18n/LanguageProvider.tsx"))};
import { TripCompletionProgress } from ${JSON.stringify(path.join(root, "src/components/trips/TripCompletionProgress.tsx"))};

const base = {
  order_id: "order-1", tracking_id: "HT-2026-000001", order_status: "delivered",
  payment_terms: "pay_driver_on_delivery", invoice_total_etb: 10000,
  initiated_etb: 0, held_escrow_etb: 0, released_etb: 0, refunded_etb: 0,
  verified_net_etb: 0, balance_due_etb: 10000, commission_charged_etb: 0,
  payment_state: "payment_required", delivery_proof_recorded: true, rating_score: null,
};
const released = { ...base, order_id: "order-2", released_etb: 10000,
  verified_net_etb: 10000, balance_due_etb: 0, commission_charged_etb: 200,
  payment_state: "released", rating_score: 5 };

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null,
    React.createElement("main", { className: "mx-auto max-w-2xl px-3 py-4" },
      React.createElement(TripCompletionProgress, { orderId: base.order_id, audience: "driver", initialSummary: base }),
      React.createElement(TripCompletionProgress, { orderId: released.order_id, audience: "customer", initialSummary: released })
    )
  )
);
setTimeout(() => {
  document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
  document.documentElement.dataset.ready = "true";
}, 100);
`;
  const entry = path.join(testDirectory, "entry.mjs");
  await writeFile(entry, source, "utf8");
  const bundled = spawnSync(bin("esbuild"), [entry, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Trip completion fixture bundle failed.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./trip-completion-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(bin("vite"), ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const dom = await render(chrome, { width, height: 915 });
    for (const expected of ['data-ready="true"', 'data-overflow="false"', "Trip completion", "Action needed", "Commission", "ETB 200", "Complete"]) {
      if (!dom.includes(expected)) throw new Error(`Trip completion ${width}px smoke is missing: ${expected}`);
    }
  }
  console.log("Customer/Driver trip completion smoke passed at 320px, 360px, 390px and 412px without horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
