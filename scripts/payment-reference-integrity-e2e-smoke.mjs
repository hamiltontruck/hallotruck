import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4197;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".payment-reference-integrity-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "payment-reference-integrity-e2e.js");
const htmlFile = path.join(root, "dist", "payment-reference-integrity-e2e.html");
const expectedFingerprint = "09b69699244eadd22dda0939324a5316";

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
      // Retry until preview is ready.
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
    `--window-size=${width},1100`,
    "--virtual-time-budget=3000",
    `--user-data-dir=${profile}`,
    "--dump-dom",
    `${baseUrl}payment-reference-integrity-e2e.html`,
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
  throw new Error(`Chrome could not render payment reference conflicts at ${width}px.`);
}

await mkdir(testDirectory, { recursive: true });
const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AdminPaymentReferenceConflicts } from ${JSON.stringify(path.join(root, "src", "pages", "AdminPaymentReferenceConflicts.tsx"))};
const fingerprint = "09b69699244eadd22dda0939324a5316";
const canonicalId = "11111111-1111-4111-8111-111111111111";
const rows = [
  { payment_id: canonicalId, order_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tracking_id: "HT-2026-CANON", provider: "telebirr", reference_fingerprint: fingerprint, masked_reference: "te******1234", amount_etb: 12850, event: "released", created_at: "2026-08-05T21:00:23Z", classification: "canonical", canonical_payment_id: canonicalId, order_count: 2, active_count: 2 },
  { payment_id: "22222222-2222-4222-8222-222222222222", order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tracking_id: "HT-2026-CONFLICT", provider: "telebirr", reference_fingerprint: fingerprint, masked_reference: "te******1234", amount_etb: 2500, event: "held_escrow", created_at: "2026-08-07T21:25:14Z", classification: "legacy_conflict", canonical_payment_id: canonicalId, order_count: 2, active_count: 2 },
  { payment_id: "33333333-3333-4333-8333-333333333333", order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tracking_id: "HT-2026-REFUND", provider: "telebirr", reference_fingerprint: fingerprint, masked_reference: "te******1234", amount_etb: 30000, event: "refunded", created_at: "2026-08-07T00:14:35Z", classification: "refunded", canonical_payment_id: canonicalId, order_count: 2, active_count: 2 },
  { payment_id: "44444444-4444-4444-8444-444444444444", order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tracking_id: "HT-2026-SUPERSEDED", provider: "telebirr", reference_fingerprint: fingerprint, masked_reference: "te******1234", amount_etb: 2150, event: "failed", created_at: "2026-08-07T00:10:12Z", classification: "superseded", canonical_payment_id: canonicalId, order_count: 2, active_count: 2 },
];
createRoot(document.getElementById("root")).render(
  React.createElement(MemoryRouter, null,
    React.createElement(AdminPaymentReferenceConflicts, { fixture: { rows } })
  )
);
await new Promise((resolve) => setTimeout(resolve, 250));
document.documentElement.dataset.overflow = String(
  document.documentElement.scrollWidth > document.documentElement.clientWidth ||
  document.body.scrollWidth > document.body.clientWidth
);
document.documentElement.dataset.rawReference = String(document.body.textContent.includes("TELEBIRR-RAW-REFERENCE"));
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
  "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
  "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
], { cwd: root, encoding: "utf8" });
if (bundled.status !== 0) throw new Error(bundled.stderr || "Payment reference conflict fixture bundle failed.");

await writeFile(
  htmlFile,
  `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./payment-reference-integrity-e2e.js"></script></body></html>`,
  "utf8",
);

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-payment-reference-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-ready="true"',
        'data-overflow="false"',
        'data-raw-reference="false"',
        "Payment reference conflict queue",
        "Canonical reference",
        "Legacy conflict",
        "Refunded history",
        "Superseded history",
        "te******1234",
        expectedFingerprint,
      ]) {
        if (!dom.includes(expected)) throw new Error(`Payment reference integrity ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Payment reference conflict browser smoke passed at 320px, 360px, 390px and 412px with masked references, classifications and no horizontal overflow.");
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
