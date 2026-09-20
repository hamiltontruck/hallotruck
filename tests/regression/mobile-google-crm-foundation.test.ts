import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260920172000_mobile_google_crm_vip_foundation.sql", "utf8");
const customerSource = readFileSync("apps/customer-mobile-app/src/auth/CustomerAuthBoundaryV2.tsx", "utf8");
const driverSource = readFileSync("apps/driver-mobile-app/src/onboarding.tsx", "utf8");
const adminCrmPage = readFileSync("src/pages/AdminCrmRegistry.tsx", "utf8");
const adminCrmService = readFileSync("src/services/admin-crm-registry.service.ts", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const adminToolShell = readFileSync("src/components/admin/AdminToolShell.tsx", "utf8");


test("OAuth auth trigger no longer defaults unknown identities to Driver", () => {
  assert.match(migration, /v_role_text not in \('customer', 'driver'\)[\s\S]*return new/);
  assert.match(migration, /complete_public_mobile_profile/);
  assert.match(migration, /Public onboarding may create only Customer or Driver accounts/);
  assert.doesNotMatch(migration, /else 'driver'::public\.user_role/);
});

test("public onboarding cannot mint leadership roles", () => {
  assert.match(migration, /if v_role_text not in \('customer', 'driver'\) then/);
  assert.match(migration, /raise exception 'Public onboarding may create only Customer or Driver accounts\.'/);
  assert.match(migration, /revoke all on function public\.complete_public_mobile_profile\(text, text, text\)[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.complete_public_mobile_profile\(text, text, text\)[\s\S]*to authenticated/);
});

test("Customer and Driver receive stable HALLO registry codes", () => {
  assert.match(migration, /HC-C-/);
  assert.match(migration, /HC-D-/);
  assert.match(migration, /customers_assign_public_code/);
  assert.match(migration, /profiles_assign_driver_public_code/);
  assert.match(migration, /create unique index if not exists customers_customer_code_key/);
  assert.match(migration, /create unique index if not exists profiles_driver_code_key/);
});

test("Customer CRM links authenticated identity and orders without weakening RLS", () => {
  assert.match(migration, /auth_user_id uuid references auth\.users\(id\)/);
  assert.match(migration, /update public\.orders o[\s\S]*customer_record_id = c\.id/);
  assert.match(migration, /private\.sync_order_customer_record_id\(\)[\s\S]*security definer/);
  assert.match(migration, /revoke all on function private\.sync_order_customer_record_id\(\)[\s\S]*from public, anon, authenticated/);
});

test("VIP/customer level changes are leadership-only and audited", () => {
  assert.match(migration, /customer_level in \('standard','silver','gold','vip'\)/);
  assert.match(migration, /customer_level_audit/);
  assert.match(migration, /private\.require_active_leadership\('admin_set_customer_level'\)/);
  assert.match(migration, /admin_customer_registry_report/);
  assert.match(migration, /largestOrderEtb/);
  assert.match(migration, /lifetimeOrderEtb/);
});

test("Admin Driver registry reports plate and eight-file verification progress", () => {
  assert.match(migration, /admin_driver_registry_report/);
  assert.match(migration, /plateNumber/);
  assert.match(migration, /requiredDocumentsSubmitted/);
  assert.match(migration, /requiredDocumentsVerified/);
  for (const key of ["driver_photo","license_front","license_back","national_id_front","national_id_back","vehicle_registration","truck_front","truck_side"]) {
    assert.match(migration, new RegExp(key));
  }
});

test("both mobile apps route missing Google profiles through the shared secure RPC", () => {
  assert.match(customerSource, /complete_public_mobile_profile/);
  assert.match(customerSource, /p_role: "customer"/);
  assert.match(driverSource, /complete_public_mobile_profile/);
  assert.match(driverSource, /p_role: 'driver'/);
});


test("Admin/CEO CRM exposes stable IDs, Customer value, VIP controls and Driver readiness", () => {
  assert.match(appSource, /path="\/admin\/crm"/);
  assert.match(appSource, /AdminCrmRegistry/);
  assert.match(adminToolShell, /Customer & Driver CRM/);
  assert.match(adminCrmService, /admin_customer_registry_report/);
  assert.match(adminCrmService, /admin_driver_registry_report/);
  assert.match(adminCrmService, /admin_set_customer_level/);
  assert.match(adminCrmPage, /customerCode/);
  assert.match(adminCrmPage, /driverCode/);
  assert.match(adminCrmPage, /largestOrderEtb/);
  assert.match(adminCrmPage, /lifetimeOrderEtb/);
  assert.match(adminCrmPage, /requiredDocumentsVerified/);
  assert.match(adminCrmPage, /\/8/);
  assert.match(adminCrmPage, /Reason/);
  assert.match(adminCrmPage, /VIP Customers/);
});
