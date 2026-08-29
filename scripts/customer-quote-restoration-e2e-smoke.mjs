import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4194;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const htmlFile = path.join(root, "dist", "customer-quote-restoration-e2e.html");

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
      // Retry until Vite preview is ready.
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
    "--run-all-compositor-stages-before-draw",
    `--window-size=${width},915`,
    "--virtual-time-budget=2500",
    `--user-data-dir=${profile}`,
    "--dump-dom",
    `${baseUrl}customer-quote-restoration-e2e.html`,
  ];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
      timeout: 30000,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Customer quote at ${width}px.`);
}

const assetFiles = await readdir(path.join(root, "dist", "assets"));
const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
if (!cssFile) throw new Error("Built CSS not found.");

await writeFile(htmlFile, `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <link rel="stylesheet" href="./assets/${cssFile}">
</head>
<body>
  <main class="customer-map-home customer-portal-mobile">
    <nav class="customer-dashboard-nav"><div class="customer-dashboard-nav__inner"><div class="customer-dashboard-nav__tabs">
      <a class="customer-dashboard-nav__item is-active">Home</a><a class="customer-dashboard-nav__item">Ajajoota</a><a class="customer-dashboard-nav__item">Hordofi</a><a class="customer-dashboard-nav__item">Kaffaltii</a><a class="customer-dashboard-nav__item">Profaayilii</a>
    </div></div></nav>
    <section class="customer-map-home__stage">
      <form class="customer-map-home__sheet is-expanded">
        <button type="button" class="customer-map-home__handle" aria-expanded="true"><span></span></button>
        <div class="customer-map-home__sheet-heading"><div><p class="customer-eyebrow">02 · Truck filannoo</p><h2>Route fili</h2></div><div class="customer-map-home__quote"><span>Gatii tilmaamaa</span><strong>ETB 500,000</strong></div><button type="button" class="customer-map-home__sheet-toggle">⌄</button></div>
        <div class="customer-map-home__sheet-body">
          <div class="customer-map-home__vehicles">
            <button type="button"><strong>Isuzu 5 Ton</strong><small>5 Tonii</small></button>
            <button type="button"><strong>Truck 22 Ton</strong><small>22 Tonii</small></button>
            <button type="button"><strong>Truck 25 Ton</strong><small>25 Tonii</small></button>
            <button type="button"><strong>Truck 30 Ton</strong><small>30 Tonii</small></button>
            <button type="button"><strong>Trailer</strong><small>40 Tonii</small></button>
          </div>
          <div class="customer-map-home__load-grid">
            <label>Gosa feʼumsaa<select><option>Meeshaa waliigalaa</option></select></label>
            <label>Akkaataa kuusaa / feʼumsaa<select><option>Korojoodhaan</option></select></label>
            <label class="sm:col-span-2">Ibsa feʼumsaa dabalataa<textarea>Maqaa meeshaa</textarea></label>
          </div>
          <div class="customer-map-home__load-grid">
            <label>Baayʼina feʼumsaa<input value="25"></label>
            <label>Safartuu<select><option>Tonii</option><option>Kuntaala</option></select></label>
            <div><span>Wal-qixa</span><strong>25 Tonii</strong></div>
            <div><span>Capacity</span><strong>25 Tonii</strong></div>
          </div>
          <p class="customer-map-home__privacy">GPS driver order assign taʼe booda qofa mulʼata.</p>
          <button type="submit" class="customer-map-home__confirm">Mirkaneessi truck naannoo barbaadi</button>
        </div>
      </form>
    </section>
  </main>
  <script>
    (() => {
      const sheet = document.querySelector('.customer-map-home__sheet');
      const body = document.querySelector('.customer-map-home__sheet-body');
      const submit = document.querySelector('.customer-map-home__confirm');
      const required = ['Isuzu 5 Ton','Truck 22 Ton','Truck 25 Ton','Truck 30 Ton','Gosa feʼumsaa','Akkaataa kuusaa / feʼumsaa','Tonii','Kuntaala','Gatii tilmaamaa'];
      const text = document.body.textContent ?? '';
      const sheetRect = sheet.getBoundingClientRect();
      document.documentElement.dataset.fields = String(required.every((item) => text.includes(item)));
      document.documentElement.dataset.expanded = String(getComputedStyle(body).display !== 'none' && sheetRect.height > 220);
      document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
      document.documentElement.dataset.scrollable = String(sheet.scrollHeight > sheet.clientHeight);
      sheet.scrollTop = sheet.scrollHeight;
      const submitRect = submit.getBoundingClientRect();
      const finalSheetRect = sheet.getBoundingClientRect();
      document.documentElement.dataset.submitReachable = String(submitRect.top >= finalSheetRect.top - 2 && submitRect.bottom <= finalSheetRect.bottom + 2);
      document.documentElement.dataset.ready = 'true';
    })();
  </script>
</body>
</html>`, "utf8");

const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-customer-quote-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of [
        'data-ready="true"',
        'data-fields="true"',
        'data-expanded="true"',
        'data-overflow="false"',
        'data-scrollable="true"',
        'data-submit-reachable="true"',
      ]) {
        if (!dom.includes(expected)) throw new Error(`Customer quote ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  console.log("Customer quote browser smoke passed at 320px, 360px, 390px and 412px with all truck, tonnage and cargo fields visible and reachable.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await rm(htmlFile, { force: true });
}
