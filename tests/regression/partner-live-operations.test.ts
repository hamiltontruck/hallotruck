import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase", "migrations", "20261006020000_partner_live_trip_read_access.sql"), "utf8");
const service = readFileSync(path.join(root, "src", "services", "partner-live-operations.service.ts"), "utf8");
const page = readFileSync(path.join(root, "src", "pages", "PartnerLiveOperations.tsx"), "utf8");
const map = readFileSync(path.join(root, "src", "components", "partner", "PartnerLiveOperationsMap.tsx"), "utf8");
const app = readFileSync(path.join(root, "src", "App.tsx"), "utf8");

test("Partner live-trip RPC is authenticated, tenant scoped and read only", () => {
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /is_partner_member\(p_partner_id\)/);
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

test("Partner live operations route remains behind PartnerGate", () => {
  assert.match(app, /path="\/partner\/live"[\s\S]*PartnerGate[\s\S]*PartnerLiveOperations/);
});
