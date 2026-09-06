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
  assert.match(auth, /pattern=\{mode === 'signup' \? '\[0-9\]\{6\}'/);
  assert.match(auth, /role: 'driver'/);
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
