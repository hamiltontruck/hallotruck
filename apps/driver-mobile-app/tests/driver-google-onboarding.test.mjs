import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const source = readFileSync("src/onboarding.tsx", "utf8");
const auth = readFileSync("src/auth.tsx", "utf8");
const authCss = readFileSync("src/auth/driver-auth.css", "utf8");
const viteConfig = readFileSync("vite.config.ts", "utf8");
const migrationName = readdirSync("../../supabase/migrations").find((name) => name.endsWith("_driver_onboarding_vehicle_model.sql"));
const vehicleModelMigration = migrationName
  ? readFileSync(`../../supabase/migrations/${migrationName}`, "utf8")
  : "";

test("fresh Google Driver completes phone profile before protected onboarding", () => {
  assert.match(source, /Profile \| null \| undefined/);
  assert.match(source, /profile === null/);
  assert.match(source, /DriverProfileCompletion/);
  assert.match(source, /complete_public_mobile_profile/);
  assert.match(source, /p_role: 'driver'/);
  assert.match(source, /auth\.refreshSession\(\)/);
});

test("Driver onboarding still requires plate and all eight verification files", () => {
  for (const key of [
    "driver_photo","license_front","license_back","national_id_front","national_id_back",
    "vehicle_registration","truck_front","truck_side",
  ]) assert.match(source, new RegExp(key));
  assert.match(source, /Plate No/);
  assert.match(source, /driver_save_vehicle_profile/);
  assert.match(source, /8 of 8 required files submitted/);
});

test("Driver login greets Drivers in green without changing signup or reset titles", () => {
  assert.match(auth, /en: \{ welcome: "Welcome Drivers"/);
  assert.match(auth, /className=\{`driver-auth-title \$\{!signup && !reset \? "driver-auth-title--login" : ""\}`\}/);
  assert.match(authCss, /\.driver-auth-title--login h1\s*\{[^}]*color:\s*#(?:087443|008f5a|0b7a4b)/i);
});

test("Driver onboarding mirrors Admin document grouping without exposing review controls", () => {
  for (const title of ["Driver photo", "Driving license", "National ID", "Vehicle registration", "Truck photos"]) {
    assert.match(source, new RegExp(`title: '${title}'`));
  }
  assert.match(source, /8 required files · 5 groups/);
  assert.match(source, /Driver name/);
  assert.match(source, /Truck model/);
  assert.match(source, /document-group/);
  assert.match(source, /document-status/);
  assert.doesNotMatch(source, /Approve document|Verify document|Reject document/);
});

test("Driver-owned secure RPC saves the optional truck model while Admin keeps review authority", () => {
  assert.ok(migrationName, "expected a dedicated driver onboarding vehicle-model migration");
  assert.match(vehicleModelMigration, /create or replace function public\.driver_save_vehicle_profile\([\s\S]*p_model text/);
  assert.match(vehicleModelMigration, /v_driver_id uuid := auth\.uid\(\)/);
  assert.match(vehicleModelMigration, /p\.role::text = 'driver'/);
  assert.match(vehicleModelMigration, /v_driver_status = 'approved'/);
  assert.match(vehicleModelMigration, /char_length\(coalesce\(v_model, ''\)\) > 120/);
  assert.match(vehicleModelMigration, /model\s*=\s*v_model/);
  assert.match(vehicleModelMigration, /select t\.model[\s\S]*where t\.driver_id = auth\.uid\(\)/);
  assert.match(vehicleModelMigration, /grant execute on function public\.driver_save_vehicle_profile\(text, text, numeric, text\) to authenticated/);
  assert.doesNotMatch(vehicleModelMigration, /admin_save_driver_review_fields|require_active_leadership/);
  assert.match(source, /p_model: truckModel\.trim\(\)/);
});

test("document uploads preserve unsaved one-page vehicle drafts", () => {
  assert.match(source, /async function refresh\(\{ preserveVehicleDraft = false \} = \{\}\)/);
  assert.match(source, /if \(!preserveVehicleDraft\) \{[\s\S]*setPlate\([\s\S]*setTruckModel\([\s\S]*setCapacityTons\(/);
  assert.match(source, /await refresh\(\{ preserveVehicleDraft: true \}\)/);
});

test("Driver V4 dev server isolates Tailwind v4 from the repository Tailwind v3 PostCSS config", () => {
  assert.ok(existsSync("postcss.config.mjs"), "expected an app-local PostCSS boundary");
  const postcssConfig = readFileSync("postcss.config.mjs", "utf8");
  assert.match(postcssConfig, /plugins:\s*\[\s*\]/);
  assert.doesNotMatch(postcssConfig, /tailwindcss|autoprefixer/);
  assert.match(viteConfig, /postcss:\s*fileURLToPath\(new URL\("\.\/?", import\.meta\.url\)\)/);
});

test("Driver phone completion accepts Ethiopian 07 and 09 families", () => {
  assert.match(source, /\[79\]\\d\{8\}/);
  assert.match(source, /09xxxxxxxx \/ 07xxxxxxxx/);
});
