import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeDriverActiveTrip,
  normalizeDriverAvailableJobs,
  normalizeDriverTruckOptions,
  splitDriverAssignments,
} from "../.test-dist/driver-jobs/driver-jobs.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-jobs.service.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../src/driver/DriverJobsBoard.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("available jobs preserve authoritative service date and unknown money/distance", () => {
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
      service_date: "2026-09-27",
    },
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].distanceKm, null);
  assert.equal(jobs[0].priceEtb, 440000);
  assert.equal(jobs[0].serviceDate, "2026-09-27");
});

test("malformed job and truck rows are rejected before rendering or claiming", () => {
  assert.deepEqual(normalizeDriverAvailableJobs([{ id: "missing-required-fields" }]), []);
  assert.deepEqual(normalizeDriverTruckOptions([{ id: "truck-1", plate_number: "" }]), []);
});

test("accepted future assignments are scheduled instead of replacing the current trip", () => {
  const rows = [
    { id: "today", tracking_id: "HT-TODAY", status: "in_transit", pickup_address: "A", dropoff_address: "B", price_etb: 500000, accepted_at: "2026-09-25T08:00:00Z", service_date: "2026-09-25" },
    { id: "future", tracking_id: "HT-FUTURE", status: "accepted", pickup_address: "C", dropoff_address: "D", price_etb: 600000, accepted_at: "2026-09-25T09:00:00Z", service_date: "2026-09-28" },
  ];
  const split = splitDriverAssignments(rows, "2026-09-25");
  assert.equal(split.activeTrip?.id, "today");
  assert.deepEqual(split.scheduledTrips.map((trip) => trip.id), ["future"]);
});

test("only accepted and in_transit rows become active driver trips", () => {
  assert.equal(normalizeDriverActiveTrip({ id: "order-1", tracking_id: "HT-2026-001", status: "placed", pickup_address: "A", dropoff_address: "B", service_date: "2026-09-25" }), null);
  const active = normalizeDriverActiveTrip({ id: "order-1", tracking_id: "HT-2026-001", status: "in_transit", pickup_address: "A", dropoff_address: "B", price_etb: "500000", service_date: "2026-09-25" });
  assert.equal(active?.status, "in_transit");
  assert.equal(active?.priceEtb, 500000);
});

test("service uses calendar-aware canonical server authorization and authenticated-driver isolation", () => {
  assert.match(serviceSource, /\.rpc\("get_available_jobs_v2"\)/);
  assert.match(serviceSource, /\.rpc\("driver_available_trucks_for_order_v2"/);
  assert.match(serviceSource, /\.rpc\("claim_order_with_truck_v2"/);
  assert.match(serviceSource, /\.eq\("driver_id", user\.id\)/);
  assert.match(serviceSource, /service_date/);
  assert.match(serviceSource, /status=eq\.placed/);
  assert.match(serviceSource, /data\.user\.id !== expectedUserId/);
  assert.doesNotMatch(serviceSource, /user_metadata|app_metadata/);
});

test("job board shows scheduled assignments and future marketplace even while current trip exists", () => {
  assert.match(componentSource, /data-driver-scheduled-trips/);
  assert.match(componentSource, /data-driver-calendar-marketplace/);
  assert.match(componentSource, /snapshot\.scheduledTrips/);
  assert.doesNotMatch(componentSource, /!snapshot\.activeTrip && jobs\.length/);
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

test("standalone Driver app wires the production jobs board without role switching", () => {
  assert.match(appSource, /import \{ DriverJobsBoard \} from "\.\/driver\/DriverJobsBoard"/);
  assert.match(appSource, /driverOnlyScreens/);
  assert.doesNotMatch(appSource, /loadCustomerMobileWorkspace|CustomerShipmentsView|CustomerPaymentsView/);
  assert.doesNotMatch(appSource, /const jobs = \[/);
  assert.doesNotMatch(appSource, /return <ShipmentForm \/>/);
});

test("standalone Driver app excludes Customer surfaces", () => {
  assert.doesNotMatch(appSource, /CustomerMapCanvas|CustomerTrackingTimeline|CustomerPaymentsView/);
});
