import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4176;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".driver-payment-ux-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "driver-payment-ux-e2e.js");
const htmlFile = path.join(root, "dist", "driver-payment-ux-e2e.html");

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

function dumpDom(chrome, url, profileDirectory, viewport) {
  const common = [
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-default-apps", "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars",
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=8000", `--user-data-dir=${profileDirectory}`,
    "--dump-dom", url,
  ];
  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [headlessFlag, ...common], {
      cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
    if (result.error?.code === "ETIMEDOUT") throw new Error(`Chrome timed out while opening ${url}`);
  }
  throw new Error(`Chrome could not render ${url}`);
}

async function render(chrome, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-driver-payment-ux-e2e-"));
  try {
    return dumpDom(chrome, `${baseUrl}driver-payment-ux-e2e.html`, profile, viewport);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

function assertContains(dom, expected, label) {
  for (const value of expected) {
    if (!dom.includes(value)) throw new Error(`${label} is missing expected text: ${value}`);
  }
}

async function prepareFixture() {
  await mkdir(testDirectory, { recursive: true });
  const assetFiles = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found in dist/assets.");

  const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from ${JSON.stringify(path.join(root, "src", "i18n", "LanguageProvider.tsx"))};
import { DriverDeliveryProofForm } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverDeliveryProofForm.tsx"))};

createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null,
    React.createElement(MemoryRouter, null,
      React.createElement(DriverDeliveryProofForm, {
        orderId: "order-active-1",
        tripAmountEtb: 30000,
        onDelivered: () => undefined,
      })
    )
  )
);

setTimeout(() => {
  const cash = document.querySelector('input[value="cash_received"]');
  const bank = document.querySelector('input[value="bank_telebirr"]');
  const unpaid = document.querySelector('input[value="payment_not_received"]');
  const submit = document.querySelector('form button:not([type="button"])');
  const initialText = document.body.textContent ?? "";
  document.documentElement.dataset.initialCashSelected = String(Boolean(cash?.checked));
  document.documentElement.dataset.initialBankSelected = String(Boolean(bank?.checked));
  document.documentElement.dataset.initialSubmitDisabled = String(Boolean(submit?.disabled));
  document.documentElement.dataset.finishTrip = String(initialText.includes("Finish Trip") || initialText.includes("Submit proof"));
  document.documentElement.dataset.paymentMethod = String(initialText.includes("Payment result"));
  document.documentElement.dataset.cashOption = String(initialText.includes("Cash received"));
  document.documentElement.dataset.bankOption = String(initialText.includes("Bank / Telebirr"));
  document.documentElement.dataset.methodHelp = String(initialText.includes("Choose one result before Finish Trip"));
  document.documentElement.dataset.noUpload = String(!initialText.includes("receipt") && !initialText.includes("screenshot"));
  document.documentElement.dataset.fileInput = String(Boolean(document.querySelector('input[name="receipt"], input[name="paymentEvidence"]')));
  document.documentElement.dataset.unpaidNotice = String(Boolean(unpaid));
  cash?.click();
  setTimeout(() => {
    const cashText = document.body.textContent ?? "";
    document.documentElement.dataset.cashAmount = String(cashText.includes("Exact amount collected") && cashText.includes("ETB 30,000"));
    document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
    document.documentElement.dataset.ready = "true";
  }, 150);
}, 250);
`;

  await writeFile(entryFile, fixtureSource, "utf8");
  const bundled = spawnSync(esbuildBinary, [
    entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120",
    `--outfile=${bundleFile}`,
    "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"",
    "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\"",
  ], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Driver payment UX fixture bundle failed.");

  await readFile(path.join(root, "dist", "assets", cssFile), "utf8");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./driver-payment-ux-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root, stdio: ["ignore", "pipe", "pipe"],
});
let previewOutput = "";
preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const dom = await render(chrome, { width, height: 915 });
    const label = `Driver atomic Finish Trip ${width}px smoke`;
    assertContains(dom, [
      'data-ready="true"', 'data-initial-cash-selected="false"',
      'data-initial-bank-selected="false"', 'data-initial-submit-disabled="true"',
      'data-finish-trip="true"', 'data-payment-method="true"',
      'data-cash-option="true"', 'data-bank-option="true"',
      'data-method-help="true"', 'data-no-upload="true"',
      'data-file-input="false"', 'data-unpaid-notice="true"', 'data-cash-amount="true"',
      'data-overflow="false"',
      "Payment not received", "Exact amount collected",
      "Optional payment note",
    ], label);
  }
  console.log("Driver atomic Finish Trip browser smoke passed at 320px, 360px, 390px and 412px with all three payment results, exact-cash input, no payment-evidence upload and no horizontal overflow.");
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
  await Promise.all([
    rm(testDirectory, { recursive: true, force: true }),
    rm(bundleFile, { force: true }), rm(htmlFile, { force: true }),
  ]);
}
