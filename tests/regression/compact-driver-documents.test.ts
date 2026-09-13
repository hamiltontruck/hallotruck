import test from "node:test";
import assert from "node:assert/strict";
import { DRIVER_DOCUMENT_GROUPS, documentExpiryLabel, driverDocumentGroups, isCurrentVerifiedDocument } from "../../src/domain/driver-document-review";
import { getDriverOnboardingProgress } from "../../src/domain/driver-onboarding";
import type { DriverVerificationFile } from "../../src/services/driver.service";
const docs: DriverVerificationFile[] = DRIVER_DOCUMENT_GROUPS.flatMap((group) => group.sides.map(([key]) => ({
  id: key, driver_id: "driver-a", truck_id: group.vehicle ? "truck-a" : null, document_key: key,
  file_path: key, original_name: `${key}.jpg`, mime_type: "image/jpeg", status: "verified" as const,
  expiry_date: ["license_front", "national_id_front"].includes(key) ? "2099-12-31" : "2000-01-01", rejection_reason: null,
  reviewed_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
})));
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
