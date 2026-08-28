import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const service = source("src/services/driver-earnings.service.ts");
const page = source("src/pages/Earnings.tsx");

test("driver earnings loads complete delivered-trip detail from assigned orders", () => {
  for (const column of ["vehicle_type", "distance_km", "cargo_description", "payment_terms", "accepted_at", "delivered_at"]) {
    assert.match(service, new RegExp(column));
  }
  assert.match(service, /\.eq\("driver_id", auth\.user\.id\)/);
  assert.match(service, /\.eq\("status", "delivered"\)/);
  assert.match(service, /completedTrips: trips\.length/);
  assert.match(service, /trips,/);
});

test("delivered trips without payment are reported as unpaid instead of initiated", () => {
  assert.match(service, /initiatedEtb > 0[\s\S]*\? "initiated"[\s\S]*: "unpaid"/);
});

test("trip history shows route, operational detail and earned money", () => {
  for (const expected of ["Trip history", "Seenaa imalaa", "vehicleType", "distanceKm", "cargoDescription", "paymentProvider", "driverNetEtb"]) {
    assert.match(page, new RegExp(expected));
  }
  assert.match(page, /data\.trips\.map/);
  assert.match(page, /DriverPaymentConfirmation/);
  assert.match(page, /sm:grid-cols-4/);
});
