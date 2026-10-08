import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase", "migrations", "20261006020000_partner_live_trip_read_access.sql"), "utf8");
const assignmentGuard = readFileSync(path.join(root, "supabase", "migrations", "20261008023352_harden_partner_live_trip_tenant_assignment.sql"), "utf8");
const trackingRls = readFileSync(path.join(root, "supabase", "migrations", "20260913151910_security_rls_final_hardening.sql"), "utf8");
const service = readFileSync(path.join(root, "src", "services", "partner-live-operations.service.ts"), "utf8");
const page = readFileSync(path.join(root, "src", "pages", "PartnerLiveOperations.tsx"), "utf8");
const map = readFileSync(path.join(root, "src", "components", "partner", "PartnerLiveOperationsMap.tsx"), "utf8");
const app = readFileSync(path.join(root, "src", "App.tsx"), "utf8");

test("Partner live-trip RPC is authenticated, tenant scoped and read only", () => {
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /private\.is_partner_member\(p_partner_id\)/);
  assert.match(migration, /request\.partner_id = p_partner_id/);
  assert.match(migration, /request\.order_id = p_order_id/);
  assert.match(migration, /request\.status = 'confirmed'/);
  assert.match(migration, /trip_order\.truck_id = request\.selected_truck_id/);
  assert.match(migration, /trip_order\.driver_id = request\.selected_driver_id/);
  assert.match(migration, /revoke all on function public\.partner_get_live_trip/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /insert into|update public\.|delete from/i);
});

test("Partner live operations uses real fleet and tracking contracts", () => {
  assert.match(service, /getFleetEnterpriseData\(partnerId\)/);
  assert.match(service, /partner_get_live_trip/);
  assert.match(service, /classifyTrackingFreshness/);
  assert.match(page, /LIVE/);
  assert.match(page, /STALE/);
  assert.match(page, /OFFLINE/);
  assert.match(page, /speed_kmh/);
  assert.match(page, /heading/);
  assert.match(page, /recorded_at/);
  assert.match(map, /maplibre-gl/);
  assert.match(map, /truck_lng/);
  assert.match(map, /truck_lat/);
  assert.doesNotMatch(service + page, /Math\.random|fake gps|mock gps/i);
});

test("Partner live-trip RPC requires the current tenant truck and matching fleet driver", () => {
  assert.match(assignmentGuard, /private\.is_partner_member\(p_partner_id\)/);
  assert.match(assignmentGuard, /join public\.trucks trip_truck on trip_truck\.id = trip_order\.truck_id/i);
  assert.match(assignmentGuard, /join public\.partner_fleet_vehicles partner_vehicle/i);
  assert.match(assignmentGuard, /trip_truck\.partner_id = p_partner_id/i);
  assert.match(assignmentGuard, /partner_vehicle\.partner_id = p_partner_id/i);
  assert.match(assignmentGuard, /partner_vehicle\.truck_id = trip_order\.truck_id/i);
  assert.match(assignmentGuard, /partner_vehicle\.assigned_driver_id = trip_order\.driver_id/i);
  assert.match(assignmentGuard, /trip_truck\.driver_id = trip_order\.driver_id/i);
  assert.match(assignmentGuard, /request\.status = 'confirmed'/i);
  assert.match(assignmentGuard, /trip_order\.status in \('accepted'::public\.order_status, 'in_transit'::public\.order_status\)/i);
  assert.match(assignmentGuard, /Partner live assignment mismatch: fleet and order drivers differ/i);
  assert.doesNotMatch(assignmentGuard, /where[\s\S]*driver_id\s*=\s*auth\.uid\(\)[\s\S]*return query/i);
});

test("Partner telemetry stays behind the guarded RPC rather than direct tracking table RLS", () => {
  assert.match(trackingRls, /create policy "tracking: participants or leadership read"/i);
  assert.match(trackingRls, /o\.customer_id = \(select auth\.uid\(\)\)[\s\S]*o\.driver_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(trackingRls, /tracking:[^\n]*partner|is_partner_member\([^)]*tracking/i);
  assert.match(assignmentGuard, /revoke all on function public\.partner_get_live_trip\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(assignmentGuard, /grant execute on function public\.partner_get_live_trip\(uuid, uuid\)[\s\S]*to authenticated/i);
});

test("assignment mismatches are hidden from the map and surfaced as clear warnings", () => {
  assert.match(service, /Partner live assignment mismatch/);
  assert.match(service, /warnings/);
  assert.match(page, /setWarnings/);
  assert.match(page, /Live trip hidden/);
  assert.match(page, /role="alert"/);
});

test("Partner live operations route remains behind PartnerGate", () => {
  assert.match(app, /path="\/partner\/live"[\s\S]*PartnerGate[\s\S]*PartnerLiveOperations/);
});
