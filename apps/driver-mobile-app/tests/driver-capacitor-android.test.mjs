import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Driver launcher uses the circular-safe HALLO Driver artwork", () => {
  const icon = readFileSync(path.join(appRoot, "public/driver-app-icon.png"));
  assert.equal(createHash("sha256").update(icon).digest("hex"), "99e053054bd85f88fb5c76a484e0d9c207d02cdce3cc40fce06d33a12daed736");
});

test("Android icon setup declares real foreground/background location access idempotently", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "hallo-driver-android-"));
  try {
    const manifestPath = path.join(tempRoot, "android/app/src/main/AndroidManifest.xml");
    const iconPath = path.join(tempRoot, "public/driver-app-icon.png");
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    mkdirSync(path.dirname(iconPath), { recursive: true });
    writeFileSync(manifestPath, `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:icon="@mipmap/ic_launcher" />\n</manifest>\n`);
    cpSync(path.join(appRoot, "public/driver-app-icon.png"), iconPath);
    for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      const densityDir = path.join(tempRoot, "android/app/src/main/res", `mipmap-${density}`);
      mkdirSync(densityDir, { recursive: true });
      for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
        writeFileSync(path.join(densityDir, name), "old Capacitor icon");
      }
    }

    const runInstaller = () => spawnSync(process.execPath, [path.join(appRoot, "scripts/apply-android-icons.mjs")], {
      cwd: tempRoot,
      encoding: "utf8",
    });
    const firstRun = runInstaller();
    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
    const secondRun = runInstaller();
    assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);

    const manifest = readFileSync(manifestPath, "utf8");
    assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
    assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
    assert.match(manifest, /android\.hardware\.location\.gps/);
    assert.equal((manifest.match(/android\.permission\.ACCESS_COARSE_LOCATION/g) ?? []).length, 1);
    assert.equal((manifest.match(/android\.permission\.ACCESS_FINE_LOCATION/g) ?? []).length, 1);
    assert.equal((manifest.match(/android\.hardware\.location\.gps/g) ?? []).length, 1);
    for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      const densityDir = path.join(tempRoot, "android/app/src/main/res", `mipmap-${density}`);
      for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
        assert.equal(existsSync(path.join(densityDir, name)), false, `${density}/${name} must not shadow the HALLO legacy fallback`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
