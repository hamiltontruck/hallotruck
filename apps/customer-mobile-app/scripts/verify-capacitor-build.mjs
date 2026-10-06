import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

function readBuildEnvironment(rootDir) {
  const values = {};
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const envPath = resolve(rootDir, name);
    if (!existsSync(envPath)) continue;

    const source = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  }

  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    if (process.env[name]?.trim()) values[name] = process.env[name].trim();
  }
  return values;
}

function verifyClientEnvironment(rootDir) {
  const env = readBuildEnvironment(rootDir);
  const url = env.VITE_SUPABASE_URL?.trim() ?? "";
  const key = env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url) throw new Error("VITE_SUPABASE_URL is required for the HALLO Shipper build.");
  if (/YOUR_|<[^>]+>|project-ref|example/i.test(url)) {
    throw new Error("VITE_SUPABASE_URL still contains a placeholder value.");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("VITE_SUPABASE_URL must use HTTPS.");
  }
  if (!key) throw new Error("VITE_SUPABASE_ANON_KEY is required for the HALLO Shipper build.");
  if (/YOUR_|<[^>]+>|placeholder|example/i.test(key)) {
    throw new Error("VITE_SUPABASE_ANON_KEY still contains a placeholder value.");
  }
}

const rootDir = process.cwd();
verifyClientEnvironment(rootDir);

if (process.argv.includes("--env-only")) {
  console.log("Capacitor client environment check passed.");
  process.exit(0);
}

const distDir = resolve(rootDir, "dist");
const indexPath = resolve(distDir, "index.html");
if (!existsSync(indexPath)) throw new Error("Vite build did not create dist/index.html.");

const html = readFileSync(indexPath, "utf8");
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((asset) => !/^(?:https?:|data:|#)/i.test(asset));

if (assets.length === 0) throw new Error("Built index.html has no local script or stylesheet assets.");

for (const asset of assets) {
  if (asset.startsWith("/") || /^[a-z]+:/i.test(asset)) {
    throw new Error(`Capacitor requires relative local assets; found "${asset}".`);
  }
  const assetPath = resolve(distDir, asset);
  if (assetPath !== distDir && !assetPath.startsWith(distDir + sep)) {
    throw new Error(`Built asset escapes the dist directory: "${asset}".`);
  }
  if (!existsSync(assetPath)) throw new Error(`Built asset is missing from dist: "${asset}".`);
}

console.log(`Capacitor build checks passed (${assets.length} local assets).`);
