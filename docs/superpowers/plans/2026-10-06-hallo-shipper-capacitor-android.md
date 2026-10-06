# HALLO Shipper Capacitor Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package `apps/customer-mobile-app` as the independently installable **HALLO Shipper** Capacitor Android app with deterministic launcher resources and CI.

**Architecture:** Keep the current React/Vite Customer business logic unchanged and add the same checked-in Capacitor Android boundary proven by the Driver app. A deterministic verification/icon script owns generated Android packaging details; the web build remains the single UI source.

**Tech Stack:** React 19, TypeScript, Vite 8, Capacitor 7, Android Gradle, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-hallo-shipper-capacitor-messaging-design.md`

## Global Constraints

- App ID is exactly `com.hallotruck.shipper`.
- App display name is exactly `HALLO Shipper`.
- Web directory is `dist`; Vite production assets use relative paths.
- Existing Supabase Customer role/session checks remain fail closed.
- Only publishable client configuration may enter the APK.
- `mobile/customer/android/` is not modified.
- Launcher artwork must keep the driver, truck, route pin, and exact HALLO SHIPPER wording inside the Android circular safe zone.
- Target widths are 320, 360, 390, and 412 CSS pixels.

## Review Focus

- A missing `.env.local` value must fail the build clearly instead of producing a blank Android screen; Task 1 tests this.
- A UTF-8 BOM on the first environment key must not silently erase `VITE_SUPABASE_URL`; Task 1 verifies the build-time configuration check.
- Adaptive, round, and legacy launchers must all use the same approved artwork; Task 2 asserts checksums and XML references.
- Android sync must be idempotent and leave no untracked generated drift; Task 2 runs it twice and compares status.
- CI must build the exact checked-in Android project and upload a real APK; Task 3 verifies workflow paths and Gradle gates.

---

### Task 1: Capacitor build boundary

**Files:**
- Modify: `apps/customer-mobile-app/package.json`
- Modify: `apps/customer-mobile-app/package-lock.json`
- Modify: `apps/customer-mobile-app/vite.config.ts`
- Create: `apps/customer-mobile-app/capacitor.config.ts`
- Create: `apps/customer-mobile-app/scripts/verify-capacitor-build.mjs`
- Create: `apps/customer-mobile-app/tests/customer-capacitor-android.test.mjs`

**Interfaces:**
- Produces: Capacitor config `{ appId: "com.hallotruck.shipper", appName: "HALLO Shipper", webDir: "dist" }`.
- Produces: scripts `android:add`, `android:sync`, `android:open`, and build asset verification.

- [ ] **Step 1: Write the failing Capacitor contract tests**

Assert the exact app ID/name/webDir, relative Vite base, pinned Capacitor dependencies, Android scripts, required Vite environment names, and a verification failure for missing/placeholder Supabase URL.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd apps/customer-mobile-app && node --test tests/customer-capacitor-android.test.mjs`  
Expected: FAIL because the Capacitor config and scripts do not exist.

- [ ] **Step 3: Add the minimal Capacitor configuration and build verifier**

Add pinned `@capacitor/core`, `@capacitor/android`, and `@capacitor/cli` 7.4.x entries and regenerate the lockfile with `npm install --package-lock-only`. Set Vite `base: "./"`. Make `npm run build` execute TypeScript, Vite, then `verify-capacitor-build.mjs`.

- [ ] **Step 4: Verify GREEN and the full Customer suite**

Run: `cd apps/customer-mobile-app && npm ci && node --test tests/customer-capacitor-android.test.mjs && npm run test:ci`  
Expected: focused tests PASS; all existing Customer tests, typecheck, and Vite build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-mobile-app/package.json apps/customer-mobile-app/package-lock.json apps/customer-mobile-app/vite.config.ts apps/customer-mobile-app/capacitor.config.ts apps/customer-mobile-app/scripts/verify-capacitor-build.mjs apps/customer-mobile-app/tests/customer-capacitor-android.test.mjs
git commit -m "build(shipper): add Capacitor Android boundary"
```

### Task 2: Android project and safe-zone launcher

**Files:**
- Create: `apps/customer-mobile-app/android/**`
- Create: `apps/customer-mobile-app/public/hallo-shipper-icon.png`
- Create: `apps/customer-mobile-app/scripts/apply-android-icons.mjs`
- Modify: `apps/customer-mobile-app/tests/customer-capacitor-android.test.mjs`

**Interfaces:**
- Consumes: Task 1 Android scripts and Capacitor config.
- Produces: deterministic legacy, round, and adaptive launcher resources.
- Produces: required coarse/fine location permissions without broadening backend access.

- [ ] **Step 1: Extend the test with the launcher and manifest contract**

Assert the approved 512 × 512 optimized icon hash, identical generated PNG hashes, adaptive background/foreground XML, standard launcher manifest references, coarse/fine location permissions, and no secret/service-role text in Android assets.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/customer-mobile-app && node --test tests/customer-capacitor-android.test.mjs`  
Expected: FAIL because the Android project and icon resources are absent.

- [ ] **Step 3: Prepare the approved artwork**

Use the supplied HALLO Shipper artwork as an image-edit source. Reframe rather than redesign it: preserve the driver, truck, route pin, and exact wording; add sufficient background padding so all essential content fits the centered circular safe zone. Export an optimized RGB 512 × 512 PNG to `public/hallo-shipper-icon.png`.

- [ ] **Step 4: Add and normalize the Android project**

Run `npm run android:add`, commit the generated project, and implement `apply-android-icons.mjs` using the Driver script pattern with Shipper-specific names/colors. The script must be idempotent.

- [ ] **Step 5: Verify GREEN, sync twice, and build locally when network permits**

Run:
```bash
cd apps/customer-mobile-app
npm run android:sync
npm run android:sync
node --test tests/customer-capacitor-android.test.mjs
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug --no-daemon --stacktrace
```
Expected: tests PASS; second sync has no generated drift; Gradle produces `app-debug.apk`.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-mobile-app/android apps/customer-mobile-app/public/hallo-shipper-icon.png apps/customer-mobile-app/scripts/apply-android-icons.mjs apps/customer-mobile-app/tests/customer-capacitor-android.test.mjs
git commit -m "feat(shipper): add Android project and launcher"
```

### Task 3: HALLO Shipper Android CI

**Files:**
- Create: `.github/workflows/shipper-capacitor-android.yml`
- Modify: `apps/customer-mobile-app/tests/customer-capacitor-android.test.mjs`

**Interfaces:**
- Consumes: Task 2 checked-in Android project.
- Produces: PR/main workflow artifact `hallo-shipper-capacitor-debug`.

- [ ] **Step 1: Add a failing workflow contract assertion**

Assert path filters, Node 22, Java 21, `npm ci`, `npm run test:ci`, `npm run android:sync`, `testDebugUnitTest lintDebug assembleDebug`, APK upload path, and 14-day retention.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/customer-mobile-app && node --test tests/customer-capacitor-android.test.mjs`  
Expected: FAIL because the workflow is absent.

- [ ] **Step 3: Create the workflow**

Mirror `.github/workflows/driver-capacitor-android.yml`, scoped only to `apps/customer-mobile-app/**` and the Shipper workflow. Use CI-safe publishable placeholder values and never secrets in the committed YAML.

- [ ] **Step 4: Verify GREEN and full repository-relevant gates**

Run: `cd apps/customer-mobile-app && npm run test:ci && npm run android:sync`  
Expected: PASS with a valid Android asset tree.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/shipper-capacitor-android.yml apps/customer-mobile-app/tests/customer-capacitor-android.test.mjs
git commit -m "ci(shipper): build Android debug APK"
```

### Task 4: Device packaging smoke

**Files:**
- Modify: `apps/customer-mobile-app/design-qa.md`
- Modify: `apps/customer-mobile-app/README.md`

**Interfaces:**
- Consumes: Tasks 1–3 APK and commands.
- Produces: reproducible Windows/PowerShell install instructions and recorded device evidence.

- [ ] **Step 1: Add the documented acceptance checklist**

Document clean uninstall/install, activity launch, logcat filters, launcher-mask inspection, Supabase config check, and APK size/checksum capture.

- [ ] **Step 2: Build and install on PHW110**

Run from PowerShell: `npm.cmd run android:sync`, then `android\gradlew.bat installDebug`; launch `com.hallotruck.shipper/.MainActivity`.

- [ ] **Step 3: Capture evidence**

Verify no blank screen, no `supabaseUrl is required`, no fatal exception, correct HALLO Shipper label, and uncropped icon.

- [ ] **Step 4: Commit documentation**

```bash
git add apps/customer-mobile-app/design-qa.md apps/customer-mobile-app/README.md
git commit -m "docs(shipper): record Android packaging smoke"
```
