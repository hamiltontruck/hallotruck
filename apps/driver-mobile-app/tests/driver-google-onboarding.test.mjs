import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/onboarding.tsx", "utf8");

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

test("Driver phone completion accepts Ethiopian 07 and 09 families", () => {
  assert.match(source, /\[79\]\\d\{8\}/);
  assert.match(source, /09xxxxxxxx \/ 07xxxxxxxx/);
});
