import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/services/partner-live-operations.service.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "test-boundaries", setup(builder) {
    builder.onResolve({ filter: /supabase\.client|fleet-maintenance\.service/ }, (args) => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: args.path.includes("supabase")
      ? "export const supabase = {rpc: (...args) => globalThis.__partnerLiveRpc(...args)}"
      : "export const getFleetEnterpriseData = async () => globalThis.__partnerLiveFleet", loader: "js" }));
  } }],
});
const { loadPartnerLiveOperations } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
globalThis.__partnerLiveFleet = { vehicles: ["valid", "mismatch", "unconfirmed"].map((id) => ({ active_trip_id: id, plate_number: `TEST-${id}`, assigned_driver_name: "TEST Driver" })) };
globalThis.__partnerLiveRpc = async (_name, args) => {
  if (_name === "fleet_enterprise_vehicles") return { data: globalThis.__partnerLiveFleet.vehicles, error: null };
  if (args.p_order_id === "mismatch") return { error: { code: "42501", message: "Partner live assignment mismatch: fleet and order drivers differ" } };
  if (args.p_order_id === "unconfirmed") return { error: { code: "42501", message: "Active Partner trip not found" } };
  return { data: [{ order_id: "valid", status: "in_transit", truck_lng: 39.6, truck_lat: 8.8, recorded_at: new Date().toISOString() }], error: null };
};
const result = await loadPartnerLiveOperations("TEST-partner");
assert.equal(result.trips.length, 1);
assert.equal(result.trips[0].freshness, "LIVE");
assert.equal(result.warnings.length, 1);
assert.match(result.warnings[0], /TEST-mismatch/);
globalThis.__partnerLiveFleet.vehicles = [globalThis.__partnerLiveFleet.vehicles[0]];
globalThis.__partnerLiveRpc = async (name) => name === "fleet_enterprise_vehicles" ? {data: globalThis.__partnerLiveFleet.vehicles, error: null} : {data:[{order_id:"valid",status:"in_transit",truck_lng:null,truck_lat:null,recorded_at:new Date().toISOString()}],error:null};
assert.equal((await loadPartnerLiveOperations("TEST-partner")).trips[0].freshness,"OFFLINE","Missing GPS coordinates must never be LIVE");
globalThis.__partnerLiveRpc = async () => ({ error: { code: "42501", message: "Partner membership required" } });
await assert.rejects(loadPartnerLiveOperations("TEST-partner"), /Partner membership required/);
console.log("Partner live service: valid LIVE, mismatch warning, unconfirmed hidden, membership errors propagated PASS");
