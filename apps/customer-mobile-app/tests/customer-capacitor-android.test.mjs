import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("HALLO Shipper exposes the exact Capacitor Android contract", () => {
  const packageJson = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
  const capacitorConfig = readFileSync(path.join(appRoot, "capacitor.config.ts"), "utf8");
  const viteConfig = readFileSync(path.join(appRoot, "vite.config.ts"), "utf8");
  const envExample = readFileSync(path.join(appRoot, ".env.example"), "utf8");

  assert.match(capacitorConfig, /appId:\s*["']com\.hallotruck\.shipper["']/);
  assert.match(capacitorConfig, /appName:\s*["']HALLO Shipper["']/);
  assert.match(capacitorConfig, /webDir:\s*["']dist["']/);
  assert.match(viteConfig, /base:\s*["']\.\/["']/);

  assert.equal(packageJson.dependencies["@capacitor/core"], "7.4.3");
  assert.equal(packageJson.devDependencies["@capacitor/android"], "7.4.3");
  assert.equal(packageJson.devDependencies["@capacitor/cli"], "7.4.3");
  assert.equal(packageJson.scripts["android:add"], "cap add android");
  assert.equal(packageJson.scripts["android:sync"], "npm run build && cap sync android");
  assert.equal(packageJson.scripts["android:open"], "cap open android");
  assert.match(packageJson.scripts.build, /verify-capacitor-build\.mjs/);

  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_MAPTILER_KEY"]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
});

test("Capacitor verifier rejects missing and placeholder Supabase configuration, including BOM input", () => {
  const verifier = path.join(appRoot, "scripts/verify-capacitor-build.mjs");
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "hallo-shipper-env-"));
  const run = () => spawnSync(process.execPath, [verifier, "--env-only"], {
    cwd: tempRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    },
  });

  try {
    const missing = run();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /VITE_SUPABASE_URL is required/);

    writeFileSync(path.join(tempRoot, ".env.local"), "VITE_SUPABASE_URL=https:\/\/YOUR_PROJECT.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR_KEY\n");
    const placeholder = run();
    assert.notEqual(placeholder.status, 0);
    assert.match(placeholder.stderr, /placeholder/i);

    writeFileSync(path.join(tempRoot, ".env.local"), "\uFEFFVITE_SUPABASE_URL=https:\/\/febgayjolfrooaqenlje.supabase.co\nVITE_SUPABASE_ANON_KEY=sb_publishable_test_value\n");
    const validBom = run();
    assert.equal(validBom.status, 0, validBom.stderr || validBom.stdout);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
