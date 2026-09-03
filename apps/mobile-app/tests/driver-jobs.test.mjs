import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeDriverActiveTrip,
  normalizeDriverAvailableJobs,
  normalizeDriverTruckOptions,
} from "../.test-dist/driver-jobs/driver-jobs.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-jobs.service.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../src/driver/DriverJobsBoard.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("available jobs preserve unknown money and distance instead of inventing zero", () => {
  const jobs = normalizeDriverAvailableJobs([
    {
      id: "order-1",
      tracking_id: "HT-2026-001",
      pickup_address: "Finfinnee",
      dropoff_address: "Hawassa",
      vehicle_type: "Truck 22 Ton",
      distance_km: null,
      price_etb: "440000",
      cargo_description: "General cargo",
    },
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].distanceKm, null);
  assert.equal(jobs[0].priceEtb, 440000);
});

test("malformed job and truck rows are rejected before rendering or claiming", () => {
  assert.deepEqual(normalizeDriverAvailableJobs([{ id: "missing-required-fields" }]), []);
  assert.deepEqual(normalizeDriverTruckOptions([{ id: "truck-1", plate_number: "" }]), []);
});

test("only accepted and in_transit rows become active driver trips", () => {
  assert.equal(normalizeDriverActiveTrip({
    id: "order-1",
    tracking_id: "HT-2026-001",
    status: "placed",
    pickup_address: "A",
    dropoff_address: "B",
  }), null);

  const active = normalizeDriverActiveTrip({
    id: "order-1",
    tracking_id: "HT-2026-001",
    status: "in_transit",
    pickup_address: "A",
    dropoff_address: "B",
    price_etb: "500000",
  });
  assert.equal(active?.status, "in_transit");
  assert.equal(active?.priceEtb, 500000);
});

test("service uses canonical server authorization and isolates active orders to the authenticated driver", () => {
  assert.match(serviceSource, /\.rpc\("get_available_jobs"\)/);
  assert.match(serviceSource, /\.rpc\("driver_available_trucks_for_order"/);
  assert.match(serviceSource, /\.rpc\("claim_order_with_truck"/);
  assert.match(serviceSource, /\.eq\("driver_id", user\.id\)/);
  assert.match(serviceSource, /data\.user\.id !== expectedUserId/);
  assert.doesNotMatch(serviceSource, /user_metadata|app_metadata/);
  assert.doesNotMatch(serviceSource, /\.eq\("status", "placed"\)/);
});

test("job board guards overlapping refresh and claim requests while preserving confirmed data", () => {
  assert.match(componentSource, /busyRef\.current/);
  assert.match(componentSource, /queuedRefreshRef\.current/);
  assert.match(componentSource, /requestIdRef\.current/);
  assert.match(componentSource, /claimLockRef\.current/);
  assert.match(componentSource, /setSnapshot\(nextSnapshot\)/);
  assert.doesNotMatch(componentSource, /setSnapshot\(null\)/);
  assert.match(componentSource, /role="alert"/);
  assert.match(componentSource, /aria-busy=\{refreshing\}/);
});

test("mobile app replaces the hardcoded driver marketplace and routes customers to the customer workspace", () => {
  assert.match(appSource, /import \{ DriverJobsBoard \} from "\.\/driver\/DriverJobsBoard"/);
  assert.match(appSource, /import \{[\s\S]*loadCustomerMobileWorkspace/);
  assert.match(appSource, /role === "customer"\) return <CustomerShipmentsView state=\{customerState\} \/>/);
  assert.match(appSource, /<CustomerPaymentsView state=\{customerState\} \/>/);
  assert.match(appSource, /<DriverJobsBoard userId=\{identity\.userId\} fullName=\{identity\.fullName\} \/>/);
  assert.doesNotMatch(appSource, /const jobs = \[/);
  assert.doesNotMatch(appSource, /return <ShipmentForm \/>/);
});

test("customer mobile app keeps the v4 booking and live tracking reference surfaces", () => {
  assert.match(appSource, /CustomerMapCanvas/);
  assert.match(appSource, /Colonel Abdisa Aga Street, Adama/);
  assert.match(appSource, /Start your booking/);
  assert.match(appSource, /Choose truck & cargo/);
  assert.match(appSource, /customerTruckOptions/);
  for (const label of ["Route", "Truck", "Cargo", "Load", "Quote", "Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo"]) {
    assert.match(appSource, new RegExp(label));
  }
  assert.match(appSource, /ETB 28,500/);
  assert.match(appSource, /Trip in progress/);
  assert.match(appSource, /CustomerTrackingTimeline/);
  assert.match(appSource, /Call driver/);
  assert.match(appSource, /Chat with driver/);
});
