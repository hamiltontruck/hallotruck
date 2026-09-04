import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4173;
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

function dumpDom(chrome, url, profileDirectory, viewport = { width: 412, height: 915 }) {
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

async function withProfile(run) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-e2e-"));
  try {
    return await run(profile);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

async function writeLanguageBootstrap(fileName, language) {
  await writeFile(path.join(root, "dist", fileName), `<!doctype html><html><body><script>
localStorage.setItem("hallo_extended_language", ${JSON.stringify(language)});
location.replace("./#/customer/login");
</script></body></html>`, "utf8");
  return `${baseUrl}${fileName}`;
}

async function writeModeBootstrap({ fileName, route, switchText, marker }) {
  await writeFile(path.join(root, "dist", fileName), `<!doctype html><html><body>
<iframe id="app" src="./#/${route}" style="width:100%;height:100vh;border:0"></iframe>
<script>
const frame = document.getElementById("app");
frame.addEventListener("load", () => {
  setTimeout(() => {
    const doc = frame.contentDocument;
    const switchButton = Array.from(doc.querySelectorAll("button")).find((button) => button.textContent.includes(${JSON.stringify(switchText)}));
    if (!switchButton) {
      document.body.innerHTML = "MODE_SWITCH_NOT_FOUND";
      return;
    }
    switchButton.click();
    setTimeout(() => {
      document.body.innerHTML = '<main data-e2e-view="${marker}">' + doc.body.innerHTML + '</main>';
    }, 300);
  }, 900);
});
</script></body></html>`, "utf8");
  return `${baseUrl}${fileName}`;
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

  const landing = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/`, profile));
  assertContains(landing, ["HALLO", "Logistics built around every role.", "Control Center", "Mobile Workspace", "Smart Portal"], "Landing page");

  const mobileCustomerLogin = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/customer/login`, profile));
  assertContains(mobileCustomerLogin, ["Welcome back", "Open customer portal", "New customer? Create an account", "autocomplete=\"email\"", "autocomplete=\"current-password\""], "Mobile customer login");

  const desktopCustomerLogin = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/customer/login`, profile, { width: 1440, height: 1000 }));
  assertContains(desktopCustomerLogin, ["Welcome back", "Hamilton Truck Transportation", "lg:grid-cols-2"], "Desktop customer login");

  const customerSignupUrl = await writeModeBootstrap({
    fileName: "e2e-customer-signup.html",
    route: "customer/login",
    switchText: "Create an account",
    marker: "customer-signup",
  });
  const customerSignup = await withProfile((profile) => dumpDom(chrome, customerSignupUrl, profile));
  assertContains(customerSignup, ["data-e2e-view=\"customer-signup\"", "autocomplete=\"name\"", "autocomplete=\"tel\"", "autocomplete=\"new-password\"", "inputmode=\"numeric\"", "pattern=\"[0-9]{6}\"", "minlength=\"6\"", "maxlength=\"6\""], "Customer signup");

  const mobileDriverLogin = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/driver/login`, profile));
  assertContains(mobileDriverLogin, ["Driver login", "Sign in", "New driver? Create an account", "autocomplete=\"email\"", "autocomplete=\"current-password\""], "Mobile driver login");

  const desktopDriverLogin = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/driver/login`, profile, { width: 1440, height: 1000 }));
  assertContains(desktopDriverLogin, ["HALLO", "DRIVER", "Driver login", "max-w-md"], "Desktop driver login");

  const driverSignupUrl = await writeModeBootstrap({
    fileName: "e2e-driver-signup.html",
    route: "driver/login",
    switchText: "Create an account",
    marker: "driver-signup",
  });
  const driverSignup = await withProfile((profile) => dumpDom(chrome, driverSignupUrl, profile));
  assertContains(driverSignup, [
    "data-e2e-view=\"driver-signup\"",
    "Create your driver account",
    "autocomplete=\"name\"",
    "autocomplete=\"tel\"",
    "autocomplete=\"email\"",
    "autocomplete=\"new-password\"",
    "inputmode=\"numeric\"",
    "pattern=\"[0-9]{6}\"",
    "minlength=\"6\"",
    "maxlength=\"6\"",
    "Create account &amp; continue to documents",
  ], "Driver signup");

  const protectedCustomer = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/customer`, profile));
  assertContains(protectedCustomer, ["Welcome back"], "Protected customer redirect");

  const protectedDriverRoutes = [
    "/driver/jobs",
    "/driver/trip",
    "/driver/documents",
    "/driver/earnings",
    "/driver/commission",
    "/driver/payment/00000000-0000-0000-0000-000000000000",
  ];
  for (const route of protectedDriverRoutes) {
    const dom = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#${route}`, profile));
    assertContains(dom, ["Driver login", "Sign in"], `Protected driver redirect ${route}`);
  }

  const somaliUrl = await writeLanguageBootstrap("e2e-language-so.html", "so");
  const somali = await withProfile((profile) => dumpDom(chrome, somaliUrl, profile));
  assertContains(somali, ["Soo dhowow mar kale", "Fur bogga macmiilka", "lang=\"so\""], "Somali language persistence");

  const tigrinyaUrl = await writeLanguageBootstrap("e2e-language-ti.html", "ti");
  const tigrinya = await withProfile((profile) => dumpDom(chrome, tigrinyaUrl, profile));
  assertContains(tigrinya, ["እንቋዕ ደሓን መጻእካ", "ፖርታል ዓሚል ክፈት", "lang=\"ti\""], "Tigrinya language persistence");

  console.log("E2E smoke tests passed: customer and driver login/signup, mobile/desktop layouts, protected routes and language persistence.");
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
    rm(path.join(root, "dist", "e2e-language-so.html"), { force: true }),
    rm(path.join(root, "dist", "e2e-language-ti.html"), { force: true }),
    rm(path.join(root, "dist", "e2e-customer-signup.html"), { force: true }),
    rm(path.join(root, "dist", "e2e-driver-signup.html"), { force: true }),
  ]);
}
