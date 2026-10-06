import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("HALLO Shipper launcher artwork is the approved 512px RGB safe-zone image", () => {
  const icon = readFileSync(path.join(appRoot, "public/hallo-shipper-icon.png"));
  assert.equal(createHash("sha256").update(icon).digest("hex"), "d31c76f0f5a3156d7a0dba527748180db3694b39bb87ade8d1063c76cec0944e");
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
  assert.equal(icon[25], 2, "PNG must use RGB color type");
});

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
  assert.equal(packageJson.scripts["android:add"], "cap add android && node scripts/apply-android-icons.mjs");
  assert.equal(packageJson.scripts["android:sync"], "npm run build && cap sync android && node scripts/apply-android-icons.mjs");
  assert.equal(packageJson.scripts["android:icons"], "node scripts/apply-android-icons.mjs");
  assert.equal(packageJson.scripts["android:open"], "cap open android");
  assert.match(packageJson.scripts.build, /verify-capacitor-build\.mjs/);

  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_MAPTILER_KEY"]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
});

test("Shipper Android icon installer is idempotent and owns location plus launcher resources", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "hallo-shipper-android-"));
  try {
    const manifestPath = path.join(tempRoot, "android/app/src/main/AndroidManifest.xml");
    const iconPath = path.join(tempRoot, "public/hallo-shipper-icon.png");
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    mkdirSync(path.dirname(iconPath), { recursive: true });
    writeFileSync(manifestPath, `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round" />\n</manifest>\n`);
    cpSync(path.join(appRoot, "public/hallo-shipper-icon.png"), iconPath);
    for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      const densityDir = path.join(tempRoot, "android/app/src/main/res", `mipmap-${density}`);
      mkdirSync(densityDir, { recursive: true });
      for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
        writeFileSync(path.join(densityDir, name), "old icon");
      }
    }

    const runInstaller = () => spawnSync(process.execPath, [path.join(appRoot, "scripts/apply-android-icons.mjs")], {
      cwd: tempRoot,
      encoding: "utf8",
    });
    const first = runInstaller();
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const second = runInstaller();
    assert.equal(second.status, 0, second.stderr || second.stdout);

    const manifest = readFileSync(manifestPath, "utf8");
    for (const permission of ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]) {
      assert.equal((manifest.match(new RegExp(`android\\.permission\\.${permission}`, "g")) ?? []).length, 1);
    }
    assert.equal((manifest.match(/android\.hardware\.location\.gps/g) ?? []).length, 1);

    const masterHash = createHash("sha256").update(readFileSync(iconPath)).digest("hex");
    for (const relative of [
      "mipmap-nodpi/ic_launcher.png",
      "mipmap-nodpi/ic_launcher_round.png",
      "drawable-nodpi/shipper_app_icon_foreground.png",
    ]) {
      const installed = readFileSync(path.join(tempRoot, "android/app/src/main/res", relative));
      assert.equal(createHash("sha256").update(installed).digest("hex"), masterHash);
    }
    const adaptive = readFileSync(path.join(tempRoot, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
    assert.match(adaptive, /@color\/shipper_app_icon_background/);
    assert.match(adaptive, /@drawable\/shipper_app_icon_foreground/);

    for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
        assert.equal(existsSync(path.join(tempRoot, "android/app/src/main/res", `mipmap-${density}`, name)), false);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("checked-in HALLO Shipper Android project uses the exact package and label", () => {
  const buildGradle = readFileSync(path.join(appRoot, "android/app/build.gradle"), "utf8");
  const strings = readFileSync(path.join(appRoot, "android/app/src/main/res/values/strings.xml"), "utf8");
  const manifest = readFileSync(path.join(appRoot, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(buildGradle, /applicationId\s+["']com\.hallotruck\.shipper["']/);
  assert.match(strings, /<string name="app_name">HALLO Shipper<\/string>/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
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
