import assert from "node:assert/strict";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/services/partner-smart-order-routing.service.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.VITE_MAPTILER_KEY": JSON.stringify("TEST-public-key") },
});
const { searchPartnerRoutePlaces } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const url = new URL(input);
  const excluded = url.searchParams.get("excludeTypes");
  if (excluded !== null && !["true", "false"].includes(excluded)) {
    return new Response("excludeTypes must be boolean", { status: 400 });
  }
  const features = excluded === "true"
    ? [{ text: "TEST Warehouse", place_name: "TEST Warehouse, Ethiopia", place_type: ["address"], center: [39.3, 8.5] }]
    : [{ text: "Adama", place_name: "Adama, Ethiopia", place_type: ["municipality"], center: [39.27, 8.54] }];
  return Response.json({ features });
};
try {
  const city = await searchPartnerRoutePlaces("adama");
  assert.deepEqual(city, [{ label: "Adama, Ethiopia", coordinates: [39.27, 8.54] }], "valid provider requests return exact city selection");
  const address = await searchPartnerRoutePlaces("warehouse");
  assert.ok(address.some(place => place.label === "TEST Warehouse, Ethiopia"), "general address results remain selectable");
} finally { globalThis.fetch = originalFetch; }
console.log("Partner geocoding: provider-compatible request returns city and address choices PASS");
