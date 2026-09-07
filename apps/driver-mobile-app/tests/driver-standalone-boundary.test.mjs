import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("driver launcher exposes only the driver workspace", () => {
  const main = read("../src/main.tsx");
  const workspace = read("../src/DriverWorkspace.tsx");

  assert.match(main, /<DriverAccess session=\{session\}>/);
  assert.match(main, /<DriverWorkspace userId=\{session\.user\.id\}/);
  assert.doesNotMatch(`${main}\n${workspace}`, /CustomerWorkspace|PartnerWorkspace|AdminWorkspace|CeoWorkspace/);
});

test("signup requires the existing exactly six digit driver PIN contract", () => {
  const auth = read("../src/auth.tsx");

  assert.match(auth, /!\/\^\\d\{6\}\$\/\.test\(password\)/);
  assert.match(auth, /pattern=\{signup \? "\[0-9\]\{6\}"/);
  assert.match(auth, /password !== confirmPassword/);
  assert.match(auth, /role: "driver"/);
  assert.match(auth, /event\.target\.value\.replace\(\/\\D\/g, ""\)\.slice\(0, 6\)/);
});

test("signup validates and normalizes HALLO contact contracts before Auth", () => {
  const auth = read("../src/auth.tsx");

  assert.match(auth, /normalizeEmail\(email\)/);
  assert.match(auth, /normalizeEthiopianPhone\(phone\)/);
  assert.match(auth, /\(\?:\\\+251\|251\|0\)\?\[79\]\\d\{8\}/);
  assert.match(auth, /full_name: normalizedName/);
  assert.match(auth, /phone: normalizedPhone/);
  assert.match(auth, /emailRedirectTo: window\.location\.href/);
});

test("signup has offline, duplicate-submit and accessible feedback guards", () => {
  const auth = read("../src/auth.tsx");

  assert.match(auth, /if \(busy\) return/);
  assert.match(auth, /navigator\.onLine/);
  assert.match(auth, /window\.addEventListener\("online"/);
  assert.match(auth, /window\.addEventListener\("offline"/);
  assert.match(auth, /role="alert" aria-live="assertive"/);
  assert.match(auth, /role="status" aria-live="polite"/);
  assert.match(auth, /if \(!data\.session\)/);
});

test("authorization is based on database role and driver status", () => {
  const onboarding = read("../src/onboarding.tsx");

  assert.match(onboarding, /from\('profiles'\)\.select\('role,driver_status'\)/);
  assert.match(onboarding, /profile\.role !== 'driver'/);
  assert.match(onboarding, /profile\.driver_status === 'suspended'/);
  assert.match(onboarding, /profile\.driver_status === 'approved'/);
});

test("onboarding saves vehicles through the existing HALLO RPC", () => {
  const onboarding = read("../src/onboarding.tsx");

  assert.match(onboarding, /rpc\('driver_save_vehicle_profile'/);
  assert.match(onboarding, /p_plate_number:/);
  assert.match(onboarding, /p_vehicle_type:/);
  assert.match(onboarding, /p_capacity_tons:/);
});

test("Driver signup documents support mobile camera formats and advance to pending review", () => {
  const onboarding = read("../src/onboarding.tsx");
  const uploadModel = read("../src/driver/driver-document-upload.model.ts");
  const uploadSheet = read("../src/driver/DriverDocumentUploadSheet.tsx");

  for (const source of [onboarding, uploadModel, uploadSheet]) {
    assert.match(source, /image\/heic/);
    assert.match(source, /image\/heif/);
  }
  assert.match(onboarding, /const onboardingComplete = identityComplete && vehicleComplete/);
  assert.match(onboarding, /Verification pending/);
  assert.match(onboarding, /9 of 9 required documents submitted/);
  assert.match(onboarding, /Admin\/CEO review is required before jobs become available/);
});

test("all clients target the same configured Supabase project", () => {
  const primary = read("../src/supabase.ts");
  const mobile = read("../src/auth/mobile-supabase.ts");

  for (const source of [primary, mobile]) {
    assert.match(source, /VITE_SUPABASE_URL/);
    assert.match(source, /VITE_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(source, /service[_-]?role/i);
  }
  assert.match(primary, /hallo-driver-mobile-v4-auth/);
  assert.match(mobile, /hallo-driver-mobile-v4-auth/);
});

test("notifications use existing user-scoped RPC and realtime contracts", () => {
  const notifications = read("../src/driver/DriverNotificationsView.tsx");

  assert.match(notifications, /rpc\("my_notifications"/);
  assert.match(notifications, /rpc\("mark_notification_read"/);
  assert.match(notifications, /table: "notifications"/);
  assert.match(notifications, /filter: `user_id=eq\.\$\{userId\}`/);
});
