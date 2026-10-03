import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { selectGeocodeCandidates, featureToPlaceForSelection } from "../src/customer-geocoder-selection.ts";

const service = fs.readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");

const djiboutiCity = {
  id: "region.1713",
  text: "Djibouti",
  place_name: "Djibouti, Djibouti",
  place_type: ["region"],
  center: [43.14727216959, 11.59369036353],
  context: [{ id: "country.dj", text: "Djibouti" }],
};

const poi = (text) => ({ id: `poi.${text}`, text, place_name: `${text}, Djibouti`, place_type: ["poi"], center: [43.15, 11.59] });

test("Djibouti prioritizes provider-identified Djibouti City and rejects same-query POIs/Ali Sabieh", () => {
  const aliSabieh = { id: "region.ali-sabieh", text: "Djibouti", place_name: "Djibouti, Ali Sabieh, Djibouti", place_type: ["region"], center: [42.71, 11.15], context: [{ id: "region.ali-sabieh", text: "Ali Sabieh" }] };
  const selected = selectGeocodeCandidates("Djibouti", [aliSabieh, djiboutiCity], [poi("Djibouti Airport"), poi("Djibouti College"), poi("Djibouti Fire Department")]);
  assert.equal(selected[0]?.id, "region.1713");
  assert.deepEqual(featureToPlaceForSelection(selected[0]), { label: "Djibouti, Djibouti", coordinates: [43.14727216959, 11.59369036353] });
  assert.equal(selected.some((feature) => feature.id === "region.ali-sabieh"), false);
  assert.equal(selected.some((feature) => feature.place_type?.includes("poi")), false);
});

test("non-Djibouti searches keep generic locality behavior and Adama remains correct", () => {
  const adama = { id: "place.adama", text: "Adama", place_name: "Adama, Oromia, Ethiopia", place_type: ["place"], center: [39.2695, 8.5414], context: [{ id: "region.oromia", text: "Oromia" }] };
  const other = { id: "poi.adama", text: "Adama Hotel", place_name: "Adama Hotel, Adama, Ethiopia", place_type: ["poi"], center: [39.27, 8.54] };
  const selected = selectGeocodeCandidates("Adama", [adama], [other]);
  assert.equal(selected[0]?.id, "place.adama");
  assert.deepEqual(featureToPlaceForSelection(selected[0])?.coordinates, [39.2695, 8.5414]);
});

test("Berbera exact city/locality outranks ambiguous region and POI candidates without rewriting provider coordinates", () => {
  const exactCity = { id: "place.berbera", text: "Berbera", place_name: "Berbera, Berbera, Somalia", place_type: ["place"], center: [44.01, 10.43], context: [{ id: "region.berbera", text: "Berbera" }, { id: "country.so", text: "Somalia" }] };
  const ambiguousRegion = { id: "region.berbera", text: "Berbera", place_name: "Berbera, Somalia", place_type: ["region"], center: [44.2, 10.6], context: [{ id: "country.so", text: "Somalia" }] };
  const berberaPoi = { id: "poi.berbera", text: "Berbera", place_name: "Berbera, Somalia", place_type: ["poi"], center: [44.05, 10.45], context: [{ id: "country.so", text: "Somalia" }] };
  const selected = selectGeocodeCandidates("Berbera", [ambiguousRegion, exactCity], [berberaPoi]);
  assert.deepEqual(selected.map((feature) => feature.id), ["place.berbera"]);
  assert.equal(selected[0]?.place_type?.[0], "place");
  assert.equal(selected[0]?.context?.[1]?.id, "country.so");
  assert.deepEqual(featureToPlaceForSelection(selected[0])?.coordinates, exactCity.center);
});

test("selected provider coordinates are preserved unchanged for quote-route input", () => {
  const selected = featureToPlaceForSelection(djiboutiCity);
  assert.deepEqual(selected?.coordinates, djiboutiCity.center);
  assert.match(service, /body: JSON\.stringify\(\{ pickup: input\.pickup\.coordinates, dropoff: input\.dropoff\.coordinates, vehicleType: input\.vehicleType \}\)/);
});
