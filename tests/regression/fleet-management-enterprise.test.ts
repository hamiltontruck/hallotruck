import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canDispatchFleetVehicle, filterFleetVehicles, getExpiryState } from "../../src/domain/fleet-management";
import type { FleetVehicle } from "../../src/services/fleet-maintenance.service";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase/migrations/20260827175200_fleet_management_enterprise.sql"), "utf8");
const service = readFileSync(path.join(root, "src/services/fleet-maintenance.service.ts"), "utf8");
const admin = readFileSync(path.join(root, "src/pages/AdminFleetMaintenance.tsx"), "utf8");
const partner = readFileSync(path.join(root, "src/components/partner/PartnerFleetPanel.tsx"), "utf8");
const portal = readFileSync(path.join(root, "src/pages/PartnerPortal.tsx"), "utf8");
const documentation = readFileSync(path.join(root, "docs/fleet-management-enterprise.md"), "utf8");

const vehicle: FleetVehicle = {
  vehicle_id: "truck-1", partner_vehicle_id: null, partner_id: null,
  plate_number: "ET-01-12345", vehicle_type: "Dry cargo", capacity_tons: 20,
  status: "available", ownership_type: "company", fuel_type: "diesel",
  branch_id: "branch-1", branch_name: "Addis Ababa", assigned_driver_id: null,
  assigned_driver_name: null, active_trip_id: null, active_trip_reference: null,
  active_trip_status: null, current_odometer_km: 45000,
  insurance_expiry: "2027-01-01", license_expiry: "2027-01-01",
  roadworthiness_expiry: "2027-01-01", last_service_date: "2026-08-01",
  next_service_date: "2026-11-01", maintenance_status: "clear",
  health_status: "healthy", dispatch_ready: true, gps_provider: null,
  last_location_at: null, updated_at: "2026-08-27T00:00:00Z",
};

test("fleet schema extends existing ledgers without rebuilding GPS or finance", () => {
  assert.match(migration, /alter table public\.trucks[\s\S]*insurance_expiry[\s\S]*roadworthiness_expiry/i);
  assert.match(migration, /alter table public\.partner_fleet_vehicles[\s\S]*truck_id uuid/i);
  assert.match(migration, /create table public\.fleet_branches/i);
  assert.match(migration, /last_location_at timestamptz/i);
  assert.match(migration, /public\.tracking_pings/i);
  assert.doesNotMatch(migration, /create table public\.tracking_pings/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(payments|driver_commission|partner_freight|partner_settlement)/i);
});

test("fleet authorization is database-backed, tenant isolated and RPC-only for writes", () => {
  assert.match(migration, /trucks_leadership_read[\s\S]*private\.is_admin_or_ceo/i);
  assert.match(migration, /trucks_partner_read[\s\S]*private\.is_partner_member/i);
  assert.match(migration, /can_manage_partner_fleet[\s\S]*member_role in \('owner', 'admin'\)/i);
  assert.match(migration, /alter table public\.fleet_audit_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.trucks from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.trucks to authenticated/i);
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/i);
  for (const rpc of ["create_fleet_branch", "create_fleet_vehicle", "update_fleet_vehicle_profile", "admin_assign_fleet_driver", "create_truck_maintenance_record"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon`, "i"));
  }
});

test("plate numbers are globally normalized and duplicate safe", () => {
  assert.match(migration, /normalize_fleet_plate/i);
  assert.match(migration, /generated always as[\s\S]*regexp_replace/i);
  assert.match(migration, /trucks_plate_key_unique/i);
  assert.match(migration, /partner_fleet_plate_key_unique/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /Existing fleet contains duplicate normalized plate numbers/i);
  assert.match(migration, /Plate number already exists in Partner fleet/i);
});

test("fleet changes preserve immutable audit history and require reasons", () => {
  assert.match(migration, /create table public\.fleet_audit_events/i);
  assert.match(migration, /fleet_audit_events_immutable[\s\S]*reject_fleet_audit_mutation/i);
  assert.match(migration, /Profile change reason is required/i);
  assert.match(migration, /Status change reason is required/i);
  assert.match(migration, /Assignment reason is required/i);
  assert.match(migration, /Maintenance status reason is required/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.fleet_audit_events/i);
});

test("availability, maintenance, expiry and active-trip guards share one fleet model", () => {
  for (const status of ["available", "assigned", "on_trip", "maintenance", "suspended", "inactive"]) assert.ok(migration.includes(`'${status}'`));
  assert.match(migration, /case when trip\.id is not null then 'on_trip'/i);
  assert.match(migration, /Truck has an active trip and cannot leave On Trip status/i);
  assert.match(migration, /Driver assignment cannot change during an active trip/i);
  assert.match(migration, /maintenance_status in \('clear', 'scheduled', 'in_progress', 'overdue'\)/i);
  assert.match(migration, /insurance_expiry <= current_date \+ 30/i);
  assert.match(migration, /next_service_date <= current_date \+ 30/i);
});

test("fleet expiry and dispatch domain rules distinguish critical state", () => {
  const reference = new Date("2026-08-27T12:00:00Z");
  assert.equal(getExpiryState(null, reference), "not_recorded");
  assert.equal(getExpiryState("2026-08-26", reference), "expired");
  assert.equal(getExpiryState("2026-09-15", reference), "due_soon");
  assert.equal(getExpiryState("2027-01-01", reference), "valid");
  assert.equal(canDispatchFleetVehicle(vehicle), true);
  assert.equal(canDispatchFleetVehicle({ ...vehicle, health_status: "critical" }), false);
  assert.equal(canDispatchFleetVehicle({ ...vehicle, active_trip_id: "trip-1" }), false);
});

test("fleet filters cover plate, truck, driver, branch, status and health", () => {
  const assigned = { ...vehicle, vehicle_id: "truck-2", plate_number: "ET-02-99999", status: "assigned" as const, health_status: "attention" as const, assigned_driver_name: "Abiyu Nagash", branch_id: "branch-2", branch_name: "Adama" };
  const rows = [vehicle, assigned];
  assert.deepEqual(filterFleetVehicles(rows, { query: "abiyu", status: "all", health: "all", branchId: "all" }).map((row) => row.vehicle_id), ["truck-2"]);
  assert.equal(filterFleetVehicles(rows, { query: "", status: "assigned", health: "attention", branchId: "branch-2" }).length, 1);
  assert.equal(filterFleetVehicles(rows, { query: "missing", status: "all", health: "all", branchId: "all" }).length, 0);
});

test("Admin and Partner fleet UIs use secure services and mobile-safe cards", () => {
  assert.match(service, /rpc\("fleet_enterprise_vehicles"/);
  assert.match(service, /rpc\("create_fleet_vehicle"/);
  assert.match(service, /rpc\("update_fleet_vehicle_profile"/);
  assert.doesNotMatch(service, /\.from\("trucks"\)\.(insert|update|delete)/);
  assert.match(admin, /data-testid="fleet-enterprise-page"/);
  assert.match(admin, /overflow-x-hidden/);
  assert.match(admin, /Expiry alerts/);
  assert.match(admin, /Active trip:/);
  assert.match(partner, /data-testid="partner-fleet-panel"/);
  assert.match(partner, /canManage/);
  assert.match(portal, /"fleet"/);
  assert.match(portal, /canManageFleet/);
});

test("fleet runbook documents deployment order, role checks and non-destructive rollback", () => {
  assert.match(documentation, /## Authorization matrix/);
  assert.match(documentation, /## Deployment order/);
  assert.match(documentation, /## Production smoke checklist/);
  assert.match(documentation, /### CEO and Admin/);
  assert.match(documentation, /### Partner Owner\/Admin/);
  assert.match(documentation, /### Driver/);
  assert.match(documentation, /320px, 360px, 390px, and 412px/);
  assert.match(documentation, /## Rollback plan/);
  assert.match(documentation, /Do not delete `fleet_audit_events`/);
  assert.match(documentation, /Never use production fleet or financial history as disposable smoke-test data/);
});
