import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  documentExpirySummary,
  documentExpiryWarning,
  documentHealth,
  documentProgress,
  formatCapacityTons,
  formatVehicleType,
  identityDocumentKeys,
  normalizeDriverProfile,
  normalizeDriverTruck,
  normalizeDriverVerification,
  vehicleDocumentKeys,
} from "../.test-dist-profile/driver-profile.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-profile.service.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../src/driver/DriverProfileView.tsx", import.meta.url), "utf8");
const previewSource = readFileSync(new URL("../src/driver/DriverDocumentPreviewSheet.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

function verification(overrides = {}) {
  return {
    id: "doc-1",
    filePath: "driver-1/identity/license_front/evidence.jpg",
    originalName: "evidence.jpg",
    mimeType: "image/jpeg",
    documentKey: "license_front",
    truckId: null,
    status: "verified",
    expiryDate: null,
    rejectionReason: null,
    updatedAt: null,
    ...overrides,
  };
}

test("normalizes only the expected Driver profile", () => {
  const profile = normalizeDriverProfile({
    id: "driver-1",
    full_name: "Adil Abdu",
    phone: "+251900000000",
    vehicle_type: "flatbed_30t",
    driver_status: "approved",
    rating_avg: "4.8",
    created_at: "2026-08-01T10:00:00Z",
  }, "driver-1");
  assert.equal(profile?.fullName, "Adil Abdu");
  assert.equal(profile?.ratingAvg, 4.8);
  assert.equal(normalizeDriverProfile({ ...profile, id: "driver-2" }, "driver-1"), null);
  assert.equal(normalizeDriverProfile({ id: "driver-1", role: "driver" }, "driver-1"), null);
});

test("normalizes assigned truck rows without false capacity", () => {
  const truck = normalizeDriverTruck({
    id: "truck-1",
    plate_number: "OR-3-12345",
    vehicle_type: "trailer_30t",
    capacity_tons: "30",
    status: "assigned",
    created_at: null,
    updated_at: "2026-08-30T12:00:00Z",
  });
  assert.equal(truck?.capacityTons, 30);
  assert.equal(normalizeDriverTruck({ id: "truck-1", plate_number: "OR-3" }), null);
  assert.equal(normalizeDriverTruck({ id: "truck-1", plate_number: "OR-3", vehicle_type: "trailer", capacity_tons: "invalid" })?.capacityTons, null);
});

test("normalizes only preview-safe verification rows with correct scope", () => {
  const identity = normalizeDriverVerification({
    id: "doc-1",
    file_path: "driver-1/identity/license_front/evidence.jpg",
    original_name: "license-front.jpg",
    mime_type: "image/jpeg",
    document_key: "license_front",
    truck_id: null,
    status: "verified",
    expiry_date: "2027-08-31",
    updated_at: "2026-08-31T10:00:00Z",
  });
  assert.equal(identity?.documentKey, "license_front");
  assert.equal(identity?.filePath, "driver-1/identity/license_front/evidence.jpg");
  assert.equal(normalizeDriverVerification({ ...identity, document_key: "license_front", truck_id: "truck-1" }), null);
  assert.equal(normalizeDriverVerification({ id: "doc-2", file_path: "x", original_name: "x", mime_type: "image/jpeg", document_key: "insurance", truck_id: null, status: "pending" }), null);
  assert.equal(normalizeDriverVerification({ id: "doc-3", file_path: "x", original_name: "x", mime_type: "text/html", document_key: "license_front", truck_id: null, status: "pending" }), null);
});

test("document health distinguishes missing, rejected and expired", () => {
  assert.equal(documentHealth(undefined, new Date("2026-08-31T00:00:00Z")), "missing");
  assert.equal(documentHealth(verification({ status: "rejected", rejectionReason: "Blurred" }), new Date("2026-08-31T00:00:00Z")), "rejected");
  assert.equal(documentHealth(verification({ expiryDate: "2026-08-30" }), new Date("2026-08-31T00:00:00Z")), "expired");
  assert.equal(documentHealth(verification({ expiryDate: "2026-08-31" }), new Date("2026-08-31T00:00:00Z")), "verified");
});

test("expiry warnings use stable UTC day boundaries", () => {
  const today = new Date("2026-09-01T18:00:00Z");
  assert.deepEqual(documentExpiryWarning(verification({ expiryDate: null }), today), { level: "none", daysRemaining: null });
  assert.deepEqual(documentExpiryWarning(verification({ expiryDate: "2026-08-31" }), today), { level: "expired", daysRemaining: -1 });
  assert.deepEqual(documentExpiryWarning(verification({ expiryDate: "2026-09-01" }), today), { level: "critical", daysRemaining: 0 });
  assert.deepEqual(documentExpiryWarning(verification({ expiryDate: "2026-09-08" }), today), { level: "critical", daysRemaining: 7 });
  assert.deepEqual(documentExpiryWarning(verification({ expiryDate: "2026-10-01" }), today), { level: "soon", daysRemaining: 30 });
  assert.deepEqual(documentExpiryWarning(verification({ expiryDate: "2026-10-02" }), today), { level: "none", daysRemaining: 31 });
  assert.deepEqual(documentExpiryWarning(verification({ status: "rejected", expiryDate: "2026-08-31" }), today), { level: "none", daysRemaining: null });
});

test("expiry summary separates expired, critical and soon evidence", () => {
  const today = new Date("2026-09-01T00:00:00Z");
  const summary = documentExpirySummary([
    verification({ id: "expired", expiryDate: "2026-08-31" }),
    verification({ id: "critical", expiryDate: "2026-09-05" }),
    verification({ id: "soon", expiryDate: "2026-09-20" }),
    verification({ id: "safe", expiryDate: "2027-01-01" }),
  ], today);
  assert.deepEqual(summary, { expired: 1, critical: 1, soon: 1 });
});

test("progress counts only verified non-expired records", () => {
  const records = [
    verification({ id: "1", documentKey: "driver_photo" }),
    verification({ id: "2", documentKey: "license_front", status: "pending" }),
    verification({ id: "3", documentKey: "license_back", expiryDate: "2026-08-30" }),
  ];
  const progress = documentProgress(identityDocumentKeys, records, null, new Date("2026-08-31T00:00:00Z"));
  assert.deepEqual(progress, { verified: 1, submitted: 3, total: 5 });
  assert.equal(vehicleDocumentKeys.length, 7);
});

test("formatters preserve unknown values instead of false zero", () => {
  assert.equal(formatVehicleType(null), "Hin galmoofne");
  assert.equal(formatVehicleType("flatbed_30t"), "Flatbed 30t");
  assert.equal(formatCapacityTons(null), "—");
  assert.equal(formatCapacityTons(30), "30 ton");
});

test("service revalidates the current Driver and creates only short signed previews", () => {
  assert.match(serviceSource, /\.eq\("id", user\.id\)/);
  assert.match(serviceSource, /\.eq\("driver_id", user\.id\)/);
  assert.match(serviceSource, /\.eq\("file_path", normalizedExpectedPath\)/);
  assert.match(serviceSource, /filePath\.startsWith\(`\$\{user\.id\}\//);
  assert.match(serviceSource, /createSignedUrl\(filePath, DRIVER_PREVIEW_SECONDS\)/);
  assert.match(serviceSource, /DRIVER_PREVIEW_SECONDS = 120/);
  assert.match(serviceSource, /auth\.getUser\(\)/);
  assert.match(serviceSource, /auth\.getSession\(\)/);
  assert.doesNotMatch(serviceSource, /getPublicUrl|publicUrl|service_role|user_metadata|app_metadata/);
  assert.doesNotMatch(serviceSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("preview sheet is private, accessible and transient", () => {
  assert.match(previewSource, /data-driver-document-preview-sheet/);
  assert.match(previewSource, /role="dialog"/);
  assert.match(previewSource, /referrerPolicy="no-referrer"/);
  assert.match(previewSource, /loadPreview = createDriverDocumentPreview/);
  assert.match(previewSource, /navigator\.onLine === false/);
  assert.match(previewSource, /window\.open\(preview\.signedUrl/);
  assert.doesNotMatch(previewSource, /localStorage|sessionStorage|getPublicUrl/);
});

test("profile view surfaces signed preview controls and expiry attention", () => {
  assert.match(componentSource, /Promise\.allSettled/);
  assert.match(componentSource, /profileConfirmed/);
  assert.match(componentSource, /trucksConfirmed/);
  assert.match(componentSource, /documentsConfirmed/);
  assert.match(componentSource, /refreshInFlightRef/);
  assert.match(componentSource, /queuedRefreshRef/);
  assert.match(componentSource, /data-mobile-driver-profile/);
  assert.match(componentSource, /DriverDocumentUploadSheet/);
  assert.match(componentSource, /DriverDocumentPreviewSheet/);
  assert.match(componentSource, /documentExpirySummary/);
  assert.match(componentSource, /data-driver-document-expiry-warning/);
  assert.match(componentSource, />Ilaali</);
});

test("App routes only Driver profile to production profile component", () => {
  assert.match(appSource, /DriverProfileView/);
  assert.match(appSource, /role === "driver"/);
  assert.match(appSource, /CustomerProfileView/);
  assert.doesNotMatch(appSource, /Abdi Driver/);
});
