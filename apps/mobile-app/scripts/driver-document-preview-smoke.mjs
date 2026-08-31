import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4195;
const baseUrl = `http://${host}:${port}/`;
const fixtureUrl = `${baseUrl}driver-document-preview-e2e.html`;
const vite = path.join(root, "node_modules/.bin", process.platform === "win32" ? "vite.cmd" : "vite");
const temp = path.join(root, ".driver-document-preview-e2e");
const entry = path.join(temp, "entry.tsx");
const html = path.join(root, "driver-document-preview-e2e.html");

function chromeBinary() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(fixtureUrl)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Mobile preview server did not start.");
}

function render(chrome, width, profile) {
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},1200`, "--virtual-time-budget=5000", `--user-data-dir=${profile}`, "--dump-dom", fixtureUrl], { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render document preview at ${width}px.`);
}

await mkdir(temp, { recursive: true });
const previewUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="white"/><text x="50%" y="50%" text-anchor="middle" font-size="44">HALLO private document</text></svg>')}`;
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import { DriverDocumentPreviewSheet } from "../src/driver/DriverDocumentPreviewSheet";
const record = { id:"doc-1", filePath:"driver-1/identity/license_front/evidence.jpg", originalName:"license-front.png", mimeType:"image/png", documentKey:"license_front", truckId:null, status:"verified", expiryDate:"2026-09-20", rejectionReason:null, updatedAt:"2026-09-01T00:00:00Z" };
const loadPreview = async () => ({ signedUrl:${JSON.stringify(previewUrl)}, mimeType:"image/png", originalName:"license-front.png", expiresInSeconds:120 });
createRoot(document.getElementById("root")).render(React.createElement(DriverDocumentPreviewSheet,{expectedUserId:"driver-1",record,documentLabel:"Hayyama konkolaachisummaa",onClose:()=>undefined,loadPreview}));
await new Promise((resolve)=>setTimeout(resolve,500));
document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth);
document.documentElement.dataset.ready="true";
`;
await writeFile(entry, fixtureSource, "utf8");
await writeFile(html, '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/.driver-document-preview-e2e/entry.tsx"></script></body></html>', "utf8");

const server = spawn(vite, ["--host", host, "--port", String(port), "--strictPort"], {
  cwd: root,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "ci-anon-key",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await waitForServer();
  const chrome = chromeBinary();
  for (const width of [320, 360, 390, 412, 430, 768]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-document-preview-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"', 'data-overflow="false"', "Signed preview", "license-front.png", "Public URL hin uumamu", ">Banu<"]) {
        if (!dom.includes(expected)) throw new Error(`Document preview ${width}px smoke missing: ${expected}`);
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
} finally {
  server.kill("SIGTERM");
  await rm(temp, { recursive: true, force: true });
  await rm(html, { force: true });
}
