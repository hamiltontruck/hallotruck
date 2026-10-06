import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = process.cwd();
const nativeRoot = resolve(appRoot, "android/app/src/main");
const manifestPath = join(nativeRoot, "AndroidManifest.xml");
const iconPath = resolve(appRoot, "public/driver-app-icon.png");

if (!existsSync(manifestPath)) {
  throw new Error("Android project is missing. Run npm run android:add first.");
}
if (!existsSync(iconPath)) {
  throw new Error("HALLO Driver icon is missing from public/driver-app-icon.png.");
}

const manifest = await readFile(manifestPath, "utf8");
if (!manifest.includes("@mipmap/ic_launcher")) {
  throw new Error("AndroidManifest.xml does not reference the standard Capacitor launcher icon.");
}

const requiredLocationEntries = [
  {
    pattern: /<uses-permission\b[^>]*android:name=["']android\.permission\.ACCESS_COARSE_LOCATION["'][^>]*\/>/,
    xml: '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  },
  {
    pattern: /<uses-permission\b[^>]*android:name=["']android\.permission\.ACCESS_FINE_LOCATION["'][^>]*\/>/,
    xml: '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  },
  {
    pattern: /<uses-feature\b[^>]*android:name=["']android\.hardware\.location\.gps["'][^>]*\/>/,
    xml: '<uses-feature android:name="android.hardware.location.gps" android:required="true" />',
  },
];
const missingLocationEntries = requiredLocationEntries
  .filter(({ pattern }) => !pattern.test(manifest))
  .map(({ xml }) => `    ${xml}`);

if (missingLocationEntries.length > 0) {
  const manifestTag = /<manifest\b[^>]*>/;
  if (!manifestTag.test(manifest)) {
    throw new Error("AndroidManifest.xml has no opening manifest element.");
  }
  const updatedManifest = manifest.replace(manifestTag, (openingTag) =>
    `${openingTag}\n${missingLocationEntries.join("\n")}`,
  );
  await writeFile(manifestPath, updatedManifest, "utf8");
}

const resources = join(nativeRoot, "res");
const legacyDir = join(resources, "mipmap-nodpi");
const foregroundDir = join(resources, "drawable-nodpi");
const adaptiveDir = join(resources, "mipmap-anydpi-v26");
const valuesDir = join(resources, "values");
const standardDensities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

await Promise.all([
  mkdir(legacyDir, { recursive: true }),
  mkdir(foregroundDir, { recursive: true }),
  mkdir(adaptiveDir, { recursive: true }),
  mkdir(valuesDir, { recursive: true }),
]);

await Promise.all([
  copyFile(iconPath, join(legacyDir, "ic_launcher.png")),
  copyFile(iconPath, join(legacyDir, "ic_launcher_round.png")),
  copyFile(iconPath, join(foregroundDir, "driver_app_icon_foreground.png")),
  ...standardDensities.flatMap((density) =>
    ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"].map((name) =>
      rm(join(resources, `mipmap-${density}`, name), { force: true }),
    ),
  ),
]);

await writeFile(
  join(valuesDir, "driver_app_icon.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="driver_app_icon_background">#1A237E</color>
</resources>
`,
  "utf8",
);

const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/driver_app_icon_background" />
    <foreground android:drawable="@drawable/driver_app_icon_foreground" />
</adaptive-icon>
`;

await Promise.all([
  writeFile(join(adaptiveDir, "ic_launcher.xml"), adaptiveIcon, "utf8"),
  writeFile(join(adaptiveDir, "ic_launcher_round.xml"), adaptiveIcon, "utf8"),
]);

console.log("HALLO Driver adaptive, round, and legacy launcher icons installed.");
