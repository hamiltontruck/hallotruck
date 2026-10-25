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
  const query = decodeURIComponent(url.pathname.split("/").pop().replace(/\.json$/, ""));
  if (query === "missing metadata") return Response.json({features:[{id:"poi.1",text:"Warehouse",place_name:"Warehouse",place_type:["poi"],center:[39.3,8.5]}]});
  if (query === "invalid coordinates") return Response.json({features:[{text:"Invalid",place_name:"Invalid",place_type:["place"],center:[200,8]}]});
  const excluded = url.searchParams.get("excludeTypes");
  if (excluded !== null && !["true", "false"].includes(excluded)) {
    return new Response("excludeTypes must be boolean", { status: 400 });
  }
  const features = excluded === "true"
    ? [{ text: "TEST Warehouse", place_name: "TEST Warehouse, Ethiopia", place_type: ["address"], center: [39.3, 8.5], context: [{id:"country.et",text:"Ethiopia"},{id:"region.oromia",text:"Oromia"},{id:"municipality.adama",text:"Adama"}] }]
    : [{ text: "Adama", place_name: "Adama, Ethiopia", place_type: ["municipality"], center: [39.27, 8.54], context: [{id:"country.et",text:"Ethiopia"},{id:"region.oromia",text:"Oromia"}] }];
  return Response.json({ features });
};
try {
  const city = await searchPartnerRoutePlaces("adama");
  assert.deepEqual(city[0].location, {country:"Ethiopia",region:"Oromia",city:"Adama",address:"Adama, Ethiopia"}, "selected city must retain real country/region/city instead of asking the user again");
  assert.equal(city[0].label, "Adama, Ethiopia");
  assert.ok(city.some(place=>place.label === "TEST Warehouse, Ethiopia"), "exact city cannot hide selectable address/landmark results");
  const missing = await searchPartnerRoutePlaces("missing metadata");
  assert.equal(missing.length,1,"duplicate provider results must remain one choice");
  assert.deepEqual(missing[0].location,{country:"",region:"",city:"",address:"Warehouse"},"unknown country/city must not be invented");
  assert.deepEqual(await searchPartnerRoutePlaces("invalid coordinates"),[],"invalid provider coordinates must not be selectable");
  const address = await searchPartnerRoutePlaces("warehouse");
  assert.ok(address.some(place => place.label === "TEST Warehouse, Ethiopia"), "general address results remain selectable");
} finally { globalThis.fetch = originalFetch; }
console.log("Partner geocoding: structured city context, precise addresses, deduplication, missing metadata and coordinate bounds PASS");
