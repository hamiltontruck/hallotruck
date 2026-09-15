import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRIVER_DOCUMENT_GROUPS, documentExpiryLabel, driverDocumentGroups, isCurrentVerifiedDocument } from "../../src/domain/driver-document-review";
import { getDriverOnboardingProgress } from "../../src/domain/driver-onboarding";
import type { DriverVerificationFile } from "../../src/services/driver.service";

const docs: DriverVerificationFile[] = DRIVER_DOCUMENT_GROUPS.flatMap((group) => group.sides.map(([key]) => ({
  id: key, driver_id: "driver-a", truck_id: group.vehicle ? "truck-a" : null, document_key: key,
  file_path: key, original_name: `${key}.jpg`, mime_type: "image/jpeg", status: "verified" as const,
  expiry_date: ["license_front", "national_id_front"].includes(key) ? "2099-12-31" : "2000-01-01", rejection_reason: null,
  reviewed_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
})));

const portalSource = readFileSync("src/pages/Documents.tsx", "utf8");
const gateSource = readFileSync("src/components/auth/DriverGate.tsx", "utf8");
const expiryAlertSource = readFileSync("src/components/driver/DriverDocumentExpiryAlert.tsx", "utf8");
const driverMobileOnboarding = readFileSync("apps/driver-mobile-app/src/onboarding.tsx", "utf8");
const driverMobileProfileModel = readFileSync("apps/driver-mobile-app/src/driver/driver-profile.model.ts", "utf8");
const driverMobileUploadModel = readFileSync("apps/driver-mobile-app/src/driver/driver-document-upload.model.ts", "utf8");
const dispatchMigration = readFileSync("supabase/migrations/20260915033000_align_driver_dispatch_documents_to_eight_files.sql", "utf8");

test("five ordered groups hold eight required files; optional old records do not count", () => {
  const groups = driverDocumentGroups(docs, "driver-a", "truck-a");
  assert.deepEqual(groups.map((g) => g.title), ["Driver photo", "Driving license", "National ID", "Vehicle registration", "Truck photos"]);
  assert.equal(groups.flatMap((g) => g.slots).length, 8);
  assert.ok(groups.every((g) => g.status === "Verified"));
  assert.equal(getDriverOnboardingProgress([...docs, { document_key: "insurance", status: "pending" }]).required, 8);
  assert.equal(getDriverOnboardingProgress(docs).verified, 8);
});

test("license and National ID each require one front expiry; back dates never block", () => {
  const today = new Date("2026-09-12T12:00:00Z");
  for (const key of ["license_front", "national_id_front"]) {
    const front = docs.find((d) => d.document_key === key)!;
    assert.equal(isCurrentVerifiedDocument({ ...front, expiry_date: "2026-09-12" }, today), true);
    for (const expiry_date of [null, "2026-09-11", "invalid"]) assert.equal(isCurrentVerifiedDocument({ ...front, expiry_date }, today), false);
    const changed = docs.map((doc) => doc.document_key === key ? { ...doc, expiry_date: null } : doc);
    assert.equal(driverDocumentGroups(changed, "driver-a", "truck-a")[key === "license_front" ? 1 : 2].status, "Check expiry");
    assert.equal(getDriverOnboardingProgress(changed).verified, 7);
  }
  assert.equal(documentExpiryLabel("license_front"), "License expiry");
  assert.equal(documentExpiryLabel("national_id_front"), "National ID expiry");
  for (const doc of docs.filter((d) => !["license_front", "national_id_front"].includes(d.document_key))) {
    assert.equal(documentExpiryLabel(doc.document_key), null);
    assert.equal(isCurrentVerifiedDocument(doc, today), true);
  }
});

test("driver and truck boundaries keep other assignments out of required slots", () => {
  assert.ok(driverDocumentGroups(docs, "driver-b", "truck-a").every((g) => g.status === "Incomplete"));
  const groups = driverDocumentGroups(docs, "driver-a", "truck-b");
  assert.equal(groups[3].slots[0].doc, undefined);
  assert.equal(groups[4].status, "Incomplete");
  assert.equal(driverDocumentGroups(docs, "driver-a", null)[4].status, "Incomplete");
});

test("a missing or pending back must never appear verified; newest version wins", () => {
  assert.equal(driverDocumentGroups(docs.filter((d) => d.document_key !== "license_back"), "driver-a", "truck-a")[1].status, "Incomplete");
  const replacement = { ...docs[2], id: "replacement", status: "pending" as const, updated_at: "2026-09-12" };
  assert.equal(driverDocumentGroups([...docs, replacement], "driver-a", "truck-a")[1].status, "Pending");
  assert.equal(driverDocumentGroups([...docs, { ...replacement, status: "rejected" }], "driver-a", "truck-a")[1].status, "Corrections");
});

test("Driver Portal exposes only the same eight required files as Admin", () => {
  const driverSpecs = portalSource.match(/const DRIVER_DOCS:[\s\S]*?const TRUCK_DOCS:/)?.[0] ?? "";
  const truckSpecs = portalSource.match(/const TRUCK_DOCS:[\s\S]*?const statusClass/)?.[0] ?? "";
  for (const key of ["driver_photo", "license_front", "license_back", "national_id_front", "national_id_back"]) assert.match(driverSpecs, new RegExp(`key: "${key}"`));
  for (const key of ["vehicle_registration", "truck_front", "truck_side"]) assert.match(truckSpecs, new RegExp(`key: "${key}"`));
  for (const legacy of ["insurance", "transport_permit", "truck_back", "truck_loading_area"]) assert.doesNotMatch(truckSpecs, new RegExp(`key: "${legacy}"`));
  assert.match(portalSource, /license_front[^\n]*expiry: true/);
  assert.match(portalSource, /national_id_front[^\n]*expiry: true/);
  assert.doesNotMatch(portalSource, /license_back[^\n]*expiry: true/);
  assert.doesNotMatch(portalSource, /national_id_back[^\n]*expiry: true/);
  assert.match(gateSource, /Complete the eight required files/);
  assert.match(expiryAlertSource, /const expiryKeys = \["license_front", "national_id_front"\]/);
});

test("Driver Mobile TypeScript clients use five identity plus three vehicle files", () => {
  assert.match(driverMobileProfileModel, /vehicleDocumentKeys[\s\S]*"vehicle_registration", "truck_front", "truck_side"/);
  assert.match(driverMobileUploadModel, /expiryDocumentKeys = new Set<VerificationDocumentKey>\(\["license_front", "national_id_front"\]\)/);
  assert.match(driverMobileUploadModel, /photoOnlyDocumentKeys = new Set<VerificationDocumentKey>\(\["driver_photo", "truck_front", "truck_side"\]\)/);
  assert.match(driverMobileOnboarding, /8 of 8 required files submitted/);
  assert.match(driverMobileOnboarding, /All eight required files are submitted/);
  assert.doesNotMatch(driverMobileOnboarding, /\['insurance',/);
});

test("dispatch backend requires the compact eight-file set, preserves legacy evidence and keeps helper internal", () => {
  assert.match(dispatchMigration, /create or replace function public\.dispatch_documents_valid/);
  for (const key of ["driver_photo", "license_front", "license_back", "national_id_front", "national_id_back", "vehicle_registration", "truck_front", "truck_side"]) assert.match(dispatchMigration, new RegExp(`'${key}'`));
  for (const legacy of ["insurance", "transport_permit", "truck_back", "truck_loading_area"]) assert.doesNotMatch(dispatchMigration, new RegExp(`'${legacy}'`));
  assert.match(dispatchMigration, /required_key not in \('license_front', 'national_id_front'\)/);
  assert.doesNotMatch(dispatchMigration, /delete\s+from\s+public\.driver_verification_files/i);
  assert.match(dispatchMigration, /revoke all on function public\.dispatch_documents_valid\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(dispatchMigration, /grant execute on function public\.dispatch_documents_valid\(uuid, uuid\) to service_role/);
  assert.doesNotMatch(dispatchMigration, /grant execute on function public\.dispatch_documents_valid\(uuid, uuid\) to authenticated/);
});
