import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), "hallotruck-geocoding-region-"));
const outfile = path.join(tempDir, "customer-operating-region.mjs");

try {
  await build({
    entryPoints: [path.join(root, "src", "customer-operating-region.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "silent",
  });

  const region = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

  assert.deepEqual([...region.HALLO_GEOCODING_COUNTRIES], ["et", "dj", "so"]);
  assert.equal(region.isHalloOperatingCoordinate([38.7578, 8.9806]), true, "Addis Ababa must remain supported");
  assert.equal(region.isHalloOperatingCoordinate([43.1456, 11.5721]), true, "Djibouti must remain supported");
  assert.equal(region.isHalloOperatingCoordinate([45.3182, 2.0469]), true, "Mogadishu must remain supported");
  assert.equal(region.isHalloOperatingCoordinate([77.5946, 12.9716]), false, "Karnataka/India must fail closed");
  assert.equal(region.isHalloOperatingCoordinate([72.8777, 19.076]), false, "India must not enter quote routing");

  assert.equal(region.isMapTilerGeocodingUrl(new URL("https://api.maptiler.com/geocoding/Addis%20Ababa.json?key=test")), true);
  assert.equal(region.isMapTilerGeocodingUrl(new URL("https://api.maptiler.com/maps/basic-v2/style.json?key=test")), false);

  console.log("Customer geocoding region smoke passed: ET/DJ/SO remain supported and India fails closed before quote routing.");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
