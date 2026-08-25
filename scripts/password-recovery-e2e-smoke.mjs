import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4177;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".password-recovery-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "password-recovery-e2e.js");
const htmlFile = path.join(root, "dist", "password-recovery-e2e.html");

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
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=10000",
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

async function render(chrome, viewport) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-password-recovery-e2e-"));
  try {
    return dumpDom(chrome, `${baseUrl}password-recovery-e2e.html`, profile, viewport);
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
import { CustomerLogin } from ${JSON.stringify(path.join(root, "src", "pages", "CustomerLogin.tsx"))};
import { Login } from ${JSON.stringify(path.join(root, "src", "pages", "Login.tsx"))};
import { PasswordRecoveryGate } from ${JSON.stringify(path.join(root, "src", "components", "auth", "PasswordRecoveryGate.tsx"))};

const root = createRoot(document.getElementById("root"));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const hasOverflow = () => document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth;
const setInput = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const wrap = (child, key) => React.createElement(LanguageProvider, { key }, React.createElement(MemoryRouter, { initialEntries: ["/"] }, child));

async function verifyCustomerReset() {
  let requestedEmail = "";
  root.render(wrap(React.createElement(CustomerLogin, {
    initialResetMode: true,
    passwordResetRequester: async (email) => { requestedEmail = email; },
  }), "customer"));
  await wait(300);
  const pageReady = document.body.textContent.includes("Reset customer password")
    && document.body.textContent.includes("Send reset email")
    && document.body.textContent.includes("Back to customer login");
  const passwordHidden = !document.querySelector('input[type="password"]');
  const noOverflow = !hasOverflow();
  const email = document.querySelector('input[type="email"]');
  setInput(email, "customer@example.com");
  await wait(50);
  document.querySelector("form").requestSubmit();
  await wait(300);
  return {
    pageReady,
    passwordHidden,
    noOverflow,
    sent: requestedEmail === "customer@example.com" && document.body.textContent.includes("If an account exists for this email"),
  };
}

async function verifyDriverReset() {
  let requestedEmail = "";
  root.render(wrap(React.createElement(Login, {
    initialResetMode: true,
    passwordResetRequester: async (email) => { requestedEmail = email; },
  }), "driver"));
  await wait(300);
  const pageReady = document.body.textContent.includes("Reset driver password")
    && document.body.textContent.includes("Send reset email")
    && document.body.textContent.includes("Back to driver login");
  const passwordHidden = !document.querySelector('input[type="password"]');
  const noOverflow = !hasOverflow();
  const email = document.querySelector('input[type="email"]');
  setInput(email, "driver@example.com");
  await wait(50);
  document.querySelector("form").requestSubmit();
  await wait(300);
  return {
    pageReady,
    passwordHidden,
    noOverflow,
    sent: requestedEmail === "driver@example.com" && document.body.textContent.includes("If an account exists for this email"),
  };
}

async function verifyNewPassword() {
  let updatedPassword = "";
  root.render(wrap(React.createElement(PasswordRecoveryGate, {
    fixture: {
      recovering: true,
      portal: "driver",
      updatePassword: async (password) => { updatedPassword = password; },
    },
  }, React.createElement("p", null, "Hidden application")), "recovery"));
  await wait(300);
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  setInput(passwordInputs[0], "SecurePass123!");
  setInput(passwordInputs[1], "SecurePass123!");
  await wait(50);
  document.querySelector("form").requestSubmit();
  await wait(300);
  return {
    updated: updatedPassword === "SecurePass123!" && document.body.textContent.includes("Password updated successfully"),
    roleRoute: document.body.textContent.includes("Continue to Driver login"),
    noOverflow: !hasOverflow(),
  };
}

const customer = await verifyCustomerReset();
const driver = await verifyDriverReset();
const recovery = await verifyNewPassword();
document.documentElement.dataset.customerPage = String(customer.pageReady);
document.documentElement.dataset.customerPasswordHidden = String(customer.passwordHidden);
document.documentElement.dataset.customerSent = String(customer.sent);
document.documentElement.dataset.customerOverflow = String(!customer.noOverflow);
document.documentElement.dataset.driverPage = String(driver.pageReady);
document.documentElement.dataset.driverPasswordHidden = String(driver.passwordHidden);
document.documentElement.dataset.driverSent = String(driver.sent);
document.documentElement.dataset.driverOverflow = String(!driver.noOverflow);
document.documentElement.dataset.recoveryUpdated = String(recovery.updated);
document.documentElement.dataset.recoveryRoleRoute = String(recovery.roleRoute);
document.documentElement.dataset.recoveryOverflow = String(!recovery.noOverflow);
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
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Password recovery fixture bundle failed.");

  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./password-recovery-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();

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
  for (const width of [320, 360, 390, 412]) {
    const dom = await render(chrome, { width, height: 915 });
    const label = `Password recovery ${width}px smoke`;
    assertContains(dom, [
      'data-ready="true"',
      'data-customer-page="true"',
      'data-customer-password-hidden="true"',
      'data-customer-sent="true"',
      'data-customer-overflow="false"',
      'data-driver-page="true"',
      'data-driver-password-hidden="true"',
      'data-driver-sent="true"',
      'data-driver-overflow="false"',
      'data-recovery-updated="true"',
      'data-recovery-role-route="true"',
      'data-recovery-overflow="false"',
      "Password updated successfully",
      "Continue to Driver login",
    ], label);
  }
  console.log("Customer and Driver password recovery browser smoke passed at 320px, 360px, 390px and 412px with role-aware completion and no horizontal overflow.");
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
    rm(bundleFile, { force: true }),
    rm(htmlFile, { force: true }),
  ]);
}
