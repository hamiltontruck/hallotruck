import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_VERIFICATION_FILE_BYTES,
  buildVerificationObjectPath,
  cleanVerificationFileName,
  replacementWarning,
  validateVerificationUpload,
} from "../.test-dist-document-upload/driver-document-upload.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-document-upload.service.ts", import.meta.url), "utf8");
const sheetSource = readFileSync(new URL("../src/driver/DriverDocumentUploadSheet.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../src/driver/DriverProfileView.tsx", import.meta.url), "utf8");

test("validates identity and vehicle upload scope", () => {
  assert.doesNotThrow(() => validateVerificationUpload({
    documentKey: "license_front",
    file: { name: "license.pdf", type: "application/pdf", size: 1200 },
    truckId: null,
    expiryDate: "2027-08-31",
    today: new Date("2026-08-31T00:00:00Z"),
  }));
  assert.throws(() => validateVerificationUpload({
    documentKey: "license_front",
    file: { name: "license.pdf", type: "application/pdf", size: 1200 },
    truckId: "truck-1",
  }), /must not be linked/);
  assert.throws(() => validateVerificationUpload({
    documentKey: "insurance",
    file: { name: "insurance.pdf", type: "application/pdf", size: 1200 },
    truckId: null,
  }), /Choose an assigned truck/);
});

test("enforces MIME, photo-only and 10 MB boundaries", () => {
  assert.throws(() => validateVerificationUpload({
    documentKey: "driver_photo",
    file: { name: "photo.pdf", type: "application/pdf", size: 1000 },
    truckId: null,
  }), /photo/);
  assert.throws(() => validateVerificationUpload({
    documentKey: "national_id_front",
    file: { name: "id.txt", type: "text/plain", size: 1000 },
    truckId: null,
  }), /JPG, PNG, WebP or PDF/);
  assert.throws(() => validateVerificationUpload({
    documentKey: "national_id_front",
    file: { name: "id.png", type: "image/png", size: MAX_VERIFICATION_FILE_BYTES + 1 },
    truckId: null,
  }), /10 MB/);
  assert.throws(() => validateVerificationUpload({
    documentKey: "national_id_front",
    file: { name: "id.png", type: "image/png", size: 0 },
    truckId: null,
  }), /duwwaa/);
});

test("rejects malformed and expired optional expiry dates", () => {
  assert.throws(() => validateVerificationUpload({
    documentKey: "license_front",
    file: { name: "license.png", type: "image/png", size: 1000 },
    truckId: null,
    expiryDate: "31-08-2027",
  }), /Expiry date/);
  assert.throws(() => validateVerificationUpload({
    documentKey: "license_front",
    file: { name: "license.png", type: "image/png", size: 1000 },
    truckId: null,
    expiryDate: "2026-08-30",
    today: new Date("2026-08-31T00:00:00Z"),
  }), /yeroon isaa darbe/);
  assert.throws(() => validateVerificationUpload({
    documentKey: "driver_photo",
    file: { name: "photo.png", type: "image/png", size: 1000 },
    truckId: null,
    expiryDate: "2027-08-31",
  }), /hin barbaachisu/);
});

test("builds private owner paths with safe file names", () => {
  assert.equal(cleanVerificationFileName("My Driver ID (Front).PNG"), "my-driver-id-front-.png");
  assert.equal(buildVerificationObjectPath({
    userId: "driver-1",
    documentKey: "driver_photo",
    truckId: null,
    fileName: "Photo.JPG",
    uniqueToken: "token-1",
  }), "driver-1/identity/driver_photo/token-1-photo.jpg");
  assert.equal(buildVerificationObjectPath({
    userId: "driver-1",
    documentKey: "insurance",
    truckId: "truck-1",
    fileName: "Insurance 2027.pdf",
    uniqueToken: "token-2",
  }), "driver-1/truck-truck-1/insurance/token-2-insurance-2027.pdf");
});

test("replacement warning explains review reset", () => {
  const verified = { id: "doc-1", documentKey: "license_front", truckId: null, status: "verified", expiryDate: null, rejectionReason: null, updatedAt: null };
  assert.match(replacementWarning(verified), /Pending/);
  assert.equal(replacementWarning(undefined), null);
});

test("service keeps storage and database mutation self-scoped", () => {
  assert.match(serviceSource, /VERIFICATION_BUCKET = "driver-verification"/);
  assert.match(serviceSource, /auth\.getUser\(\)/);
  assert.match(serviceSource, /auth\.getSession\(\)/);
  assert.match(serviceSource, /user\.id !== expectedUserId/);
  assert.match(serviceSource, /\.eq\("driver_id", user\.id\)/);
  assert.match(serviceSource, /upsert: false/);
  assert.match(serviceSource, /status: "pending"/);
  assert.match(serviceSource, /reconcileSavedPath/);
  assert.match(serviceSource, /existing\.file_path/);
  assert.match(serviceSource, /storage\.from\(VERIFICATION_BUCKET\)\.remove/);
  assert.doesNotMatch(serviceSource, /service[_-]?role|user_metadata|app_metadata/i);
});

test("upload sheet locks duplicate submission and supports camera or PDF", () => {
  assert.match(sheetSource, /if \(submitting\) return/);
  assert.match(sheetSource, /disabled=\{submitting \|\| !file\}/);
  assert.match(sheetSource, /capture=\{photoOnly/);
  assert.match(sheetSource, /application\/pdf/);
  assert.match(sheetSource, /data-driver-document-upload-sheet/);
  assert.match(sheetSource, /Admin\/CEO review/);
});

test("Driver Profile integrates upload and refreshes after success", () => {
  assert.match(profileSource, /DriverDocumentUploadSheet/);
  assert.match(profileSource, /uploadTarget/);
  assert.match(profileSource, /onUploaded/);
  assert.match(profileSource, /void refresh\(\)/);
  assert.doesNotMatch(profileSource, /Read-only profile/);
});
