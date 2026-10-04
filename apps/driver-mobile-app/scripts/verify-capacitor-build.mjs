import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const distDir = resolve("dist");
const indexPath = resolve(distDir, "index.html");

if (!existsSync(indexPath)) {
  throw new Error("Vite build did not create dist/index.html.");
}

const html = readFileSync(indexPath, "utf8");
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((asset) => !/^(?:https?:|data:|#)/i.test(asset));

if (assets.length === 0) {
  throw new Error("Built index.html has no local script or stylesheet assets.");
}

for (const asset of assets) {
  if (asset.startsWith("/") || /^[a-z]+:/i.test(asset)) {
    throw new Error(`Capacitor requires relative local assets; found "${asset}".`);
  }

  const assetPath = resolve(distDir, asset);
  if (assetPath !== distDir && !assetPath.startsWith(distDir + sep)) {
    throw new Error(`Built asset escapes the dist directory: "${asset}".`);
  }
  if (!existsSync(assetPath)) {
    throw new Error(`Built asset is missing from dist: "${asset}".`);
  }
}

console.log(`Capacitor build asset check passed (${assets.length} local assets).`);
