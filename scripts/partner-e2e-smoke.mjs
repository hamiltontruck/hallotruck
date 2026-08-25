import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4182;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".partner-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "partner-e2e.js");
const htmlFile = path.join(root, "dist", "partner-e2e.html");

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
    try { const response = await fetch(url); if (response.ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start in time.");
}

function render(chrome, width, profileDirectory) {
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},915`, "--virtual-time-budget=5000", `--user-data-dir=${profileDirectory}`, "--dump-dom", `${baseUrl}partner-e2e.html`];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Partner fixture at ${width}px.`);
}

async function prepareFixture() {
  await mkdir(testDirectory, { recursive: true });
  const assetFiles = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found.");
  const source = `
import React from "react";
import { createRoot } from "react-dom/client";
const Metric=({label,value})=>React.createElement('div',{className:'min-w-0 border border-asphalt/10 bg-white p-4'},React.createElement('p',{className:'font-mono text-[9px] uppercase tracking-wide text-steel'},label),React.createElement('p',{className:'mt-3 break-words font-display text-xl font-bold'},value));
function Fixture(){return React.createElement('main',{className:'min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt'},
React.createElement('header',{className:'bg-asphalt px-4 py-6 text-white'},React.createElement('p',{className:'font-mono text-[10px] tracking-[.22em] text-amber'},'HALLO LOGISTICS PARTNER'),React.createElement('h1',{className:'mt-2 break-words font-display text-3xl font-bold'},'Very Long Partner Organization Name Across Mobile Widths')),
React.createElement('section',{className:'px-4 py-5'},
React.createElement('nav',{className:'mb-5 flex max-w-full gap-2 overflow-x-auto pb-2'},...['Overview','Projects','Payments','Documents','Activity','Chat'].map(x=>React.createElement('button',{className:'whitespace-nowrap border px-4 py-2 text-xs',key:x},x))),
React.createElement('div',{className:'grid grid-cols-2 gap-3'},React.createElement(Metric,{label:'Active projects',value:'4'}),React.createElement(Metric,{label:'Pending payments',value:'ETB 1,250,000'}),React.createElement(Metric,{label:'Documents',value:'12'}),React.createElement(Metric,{label:'Members',value:'8'})),
React.createElement('section',{className:'mt-5 min-w-0 border border-asphalt/10 bg-white'},React.createElement('h2',{className:'p-4 font-display text-xl font-bold'},'Project progress'),React.createElement('div',{className:'border-t p-4'},React.createElement('p',{className:'break-words font-semibold'},'Cross-border logistics modernization and private document review'),React.createElement('p',{className:'mt-2 break-all text-xs text-steel'},'TRANSACTION-'+'9'.repeat(90)),React.createElement('div',{className:'mt-3 h-2 bg-asphalt/10'},React.createElement('div',{className:'h-full bg-amber',style:{width:'75%'}})))))}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
await new Promise(r=>setTimeout(r,150));
document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth);
document.documentElement.dataset.ready='true';
`;
  await writeFile(entryFile, source, "utf8");
  const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Partner fixture bundle failed.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./partner-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320,360,390,412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-partner-e2e-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"','data-overflow="false"','HALLO LOGISTICS PARTNER','Projects','Payments','Documents','Activity','Chat']) {
        if (!dom.includes(expected)) throw new Error(`Partner ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
  console.log("Partner browser smoke passed at 320px, 360px, 390px and 412px with no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
