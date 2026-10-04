import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

const resources = join(nativeRoot, "res");
const legacyDir = join(resources, "mipmap-nodpi");
const foregroundDir = join(resources, "drawable-nodpi");
const adaptiveDir = join(resources, "mipmap-anydpi-v26");
const valuesDir = join(resources, "values");

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
