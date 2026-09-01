import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4194;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const fixtureFile = path.join(root, "dist", "partner-dispatch-e2e.html");

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
      // Retry while Vite starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profileDirectory) {
  const args = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--window-size=${width},1200`,
    "--virtual-time-budget=3000",
    `--user-data-dir=${profileDirectory}`,
    "--dump-dom",
    `${baseUrl}partner-dispatch-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Partner dispatch fixture at ${width}px.`);
}

async function prepareFixture() {
  const assetFiles = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found.");
  const html = `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head>
<body class="bg-[#f5f3ed] text-asphalt">
<main class="min-h-screen overflow-x-hidden">
<header class="bg-asphalt px-4 py-6 text-white"><p class="font-mono text-[10px] tracking-[.2em] text-amber">PARTNER DISPATCH</p><h1 class="mt-2 break-words font-display text-3xl font-bold">Hamilton Group PLC</h1><p class="mt-2 text-sm text-white/60">Choose a driver-bound dispatch-ready truck.</p></header>
<section class="grid gap-4 px-4 py-5 lg:grid-cols-2">
<article class="min-w-0 border border-amber/40 bg-white p-4"><div class="flex flex-wrap justify-between gap-3"><div class="min-w-0"><p class="break-all font-mono text-xs">HT-2026-E2E001</p><h2 class="mt-2 break-words font-display text-xl font-bold">Addis Ababa → Adama</h2></div><span class="bg-asphalt px-3 py-2 text-[10px] text-white">PENDING</span></div><select class="mt-4 min-h-12 w-full border px-3"><option>ET-85643 · Dry cargo · Approved Driver</option></select><div class="mt-3 grid grid-cols-2 gap-2"><button class="min-h-12 bg-emerald-700 px-3 text-xs font-semibold text-white">Accept job</button><button class="min-h-12 border border-route/35 px-3 text-xs font-semibold text-route">Reject</button></div></article>
<article class="min-w-0 border border-asphalt/10 bg-white p-4"><p class="font-mono text-[10px] tracking-[.2em] text-amber-dim">ADMIN / PARTNER DISPATCH</p><h2 class="mt-2 break-words font-display text-2xl font-bold">Partner job requests</h2><p class="mt-2 break-words text-sm text-steel">Hamilton Group PLC · ET-85643 · Approved Driver</p><button class="mt-4 min-h-12 w-full bg-emerald-700 px-4 text-xs font-semibold text-white">Confirm truck &amp; driver assignment</button><input class="mt-2 min-h-12 w-full border px-3" value="Operational cancellation reason"><button class="mt-2 min-h-12 w-full border border-route/35 px-4 text-xs font-semibold text-route">Cancel request</button></article>
</section></main>
<script>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth);document.documentElement.dataset.ready="true";}));</script>
</body></html>`;
  await writeFile(fixtureFile, html, "utf8");
}

await prepareFixture();
const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-partner-dispatch-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-ready="true"',
        'data-overflow="false"',
        "PARTNER DISPATCH",
        "Accept job",
        "Reject",
        "Confirm truck &amp; driver assignment",
        "Cancel request",
      ]) {
        if (!dom.includes(expected)) throw new Error(`Partner dispatch ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Partner dispatch browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with accept/reject, Admin confirmation and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await rm(fixtureFile, { force: true });
}
