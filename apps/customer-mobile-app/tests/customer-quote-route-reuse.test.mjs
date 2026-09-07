import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");

test("Customer quote reuses a recently resolved HGV route", () => {
  assert.match(service, /ROUTE_CACHE_TTL_MS/);
  assert.match(service, /cacheRoute\(route, input\.pickup, input\.dropoff, input\.vehicleType\)/);
  assert.match(service, /const cachedRoute = readCachedRoute\(pickup, dropoff, input\.vehicleType\)/);
  assert.match(service, /const route = cachedRoute \?\? await requestHgvRoute/);
});

test("Customer quote still uses the secure pricing RPC", () => {
  assert.match(service, /client\.rpc\("calculate_transport_quote_v2"/);
  assert.match(service, /p_distance_km: route\.distance_km/);
  assert.match(service, /p_vehicle_type: input\.vehicleType/);
  assert.match(service, /p_cargo_tons: cargoTons/);
});
