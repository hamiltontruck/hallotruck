import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
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
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

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

test("rejects verification rows with wrong identity or vehicle scope", () => {
  const identity = normalizeDriverVerification({
    id: "doc-1",
    document_key: "license_front",
    truck_id: null,
    status: "verified",
    expiry_date: "2027-08-31",
    updated_at: "2026-08-31T10:00:00Z",
  });
  assert.equal(identity?.documentKey, "license_front");
  assert.equal(normalizeDriverVerification({ ...identity, document_key: "license_front", truck_id: "truck-1" }), null);
  assert.equal(normalizeDriverVerification({ id: "doc-2", document_key: "insurance", truck_id: null, status: "pending" }), null);
  assert.equal(normalizeDriverVerification({ id: "doc-3", document_key: "unknown", truck_id: null, status: "pending" }), null);
});

test("document health distinguishes missing, rejected and expired", () => {
  assert.equal(documentHealth(undefined, new Date("2026-08-31T00:00:00Z")), "missing");
  assert.equal(documentHealth({ id: "1", documentKey: "license_front", truckId: null, status: "rejected", expiryDate: null, rejectionReason: "Blurred", updatedAt: null }), "rejected");
  assert.equal(documentHealth({ id: "2", documentKey: "license_front", truckId: null, status: "verified", expiryDate: "2026-08-30", rejectionReason: null, updatedAt: null }, new Date("2026-08-31T00:00:00Z")), "expired");
  assert.equal(documentHealth({ id: "3", documentKey: "license_front", truckId: null, status: "verified", expiryDate: "2026-08-31", rejectionReason: null, updatedAt: null }, new Date("2026-08-31T00:00:00Z")), "verified");
});

test("progress counts only verified non-expired records", () => {
  const records = [
    { id: "1", documentKey: "driver_photo", truckId: null, status: "verified", expiryDate: null, rejectionReason: null, updatedAt: null },
    { id: "2", documentKey: "license_front", truckId: null, status: "pending", expiryDate: null, rejectionReason: null, updatedAt: null },
    { id: "3", documentKey: "license_back", truckId: null, status: "verified", expiryDate: "2026-08-30", rejectionReason: null, updatedAt: null },
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

test("service remains self-scoped and read-only", () => {
  assert.match(serviceSource, /\.eq\("id", user\.id\)/);
  assert.match(serviceSource, /\.eq\("driver_id", user\.id\)/);
  assert.match(serviceSource, /driver_verification_files/);
  assert.match(serviceSource, /auth\.getUser\(\)/);
  assert.match(serviceSource, /auth\.getSession\(\)/);
  assert.doesNotMatch(serviceSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(serviceSource, /user_metadata|app_metadata/);
});

test("profile view keeps independent sources and last confirmed snapshots", () => {
  assert.match(componentSource, /Promise\.allSettled/);
  assert.match(componentSource, /profileConfirmed/);
  assert.match(componentSource, /trucksConfirmed/);
  assert.match(componentSource, /documentsConfirmed/);
  assert.match(componentSource, /refreshInFlightRef/);
  assert.match(componentSource, /queuedRefreshRef/);
  assert.match(componentSource, /data-mobile-driver-profile/);
  assert.match(componentSource, /Read-only profile/);
});

test("App routes only Driver profile to production profile component", () => {
  assert.match(appSource, /DriverProfileView/);
  assert.match(appSource, /role === "driver"/);
  assert.match(appSource, /CustomerProfileView/);
  assert.doesNotMatch(appSource, /Abdi Driver/);
});
