import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite",
);

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }

  throw new Error(`No supported Chrome/Chromium binary found. Tried: ${candidates.join(", ")}`);
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
    if (!dom.includes(value)) {
      throw new Error(`${label} is missing expected text: ${value}`);
    }
  }
}

function dumpDom(chrome, url, profileDirectory) {
  const common = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=412,915",
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
    if (result.error?.code === "ETIMEDOUT") {
      throw new Error(`Chrome timed out while opening ${url}`);
    }
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
  const target = path.join(root, "dist", fileName);
  await writeFile(target, `<!doctype html>
<html><head><meta charset="UTF-8"><title>E2E language bootstrap</title></head>
<body><script>
localStorage.setItem("hallo_extended_language", ${JSON.stringify(language)});
location.replace("./#/customer/login");
</script></body></html>`, "utf8");
  return `${baseUrl}${fileName}`;
}

const preview = spawn(viteBinary, [
  "preview",
  "--host",
  host,
  "--port",
  String(port),
  "--strictPort",
], {
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
  assertContains(landing, [
    "HALLO",
    "Logistics built around every role.",
    "Control Center",
    "Mobile Workspace",
    "Smart Portal",
  ], "Landing page");

  const customerLogin = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/customer/login`, profile));
  assertContains(customerLogin, [
    "Welcome back",
    "Open customer portal",
    "New customer? Create an account",
  ], "Customer login");

  const driverLogin = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/driver/login`, profile));
  assertContains(driverLogin, [
    "Driver login",
    "Sign in",
    "New driver? Create an account",
  ], "Driver login");

  const protectedDriverRoute = await withProfile((profile) => dumpDom(chrome, `${baseUrl}#/driver/jobs`, profile));
  assertContains(protectedDriverRoute, ["Driver login"], "Protected driver redirect");

  const somaliUrl = await writeLanguageBootstrap("e2e-language-so.html", "so");
  const somali = await withProfile((profile) => dumpDom(chrome, somaliUrl, profile));
  assertContains(somali, [
    "Soo dhowow mar kale",
    "Fur bogga macmiilka",
    "lang=\"so\"",
  ], "Somali language persistence");

  const tigrinyaUrl = await writeLanguageBootstrap("e2e-language-ti.html", "ti");
  const tigrinya = await withProfile((profile) => dumpDom(chrome, tigrinyaUrl, profile));
  assertContains(tigrinya, [
    "እንቋዕ ደሓን መጻእካ",
    "ፖርታል ዓሚል ክፈት",
    "lang=\"ti\"",
  ], "Tigrinya language persistence");

  console.log("E2E smoke tests passed: landing, login portals, auth redirect and language persistence.");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (!preview.killed) preview.kill("SIGKILL");

  await Promise.all([
    rm(path.join(root, "dist", "e2e-language-so.html"), { force: true }),
    rm(path.join(root, "dist", "e2e-language-ti.html"), { force: true }),
  ]);
}
