import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDriverRouteFeature,
  isVisibleDriverMapViewport,
  updateDriverMarkerAndFollow,
} from "../.test-dist-active/driver-active-trip-map-runtime.js";

test("map runtime refuses zero/hidden mobile containers and accepts a real visible viewport", () => {
  assert.equal(isVisibleDriverMapViewport({ width: 0, height: 420 }), false);
  assert.equal(isVisibleDriverMapViewport({ width: 360, height: 0 }), false);
  assert.equal(isVisibleDriverMapViewport({ width: 320, height: 180 }), true);
});

test("route runtime builds a real GeoJSON LineString from server coordinates", () => {
  const feature = buildDriverRouteFeature([[38.7, 9.0], [39.1, 8.8], [39.4, 8.6]]);
  assert.equal(feature.geometry.type, "LineString");
  assert.deepEqual(feature.geometry.coordinates[0], [38.7, 9.0]);
  assert.deepEqual(feature.geometry.coordinates.at(-1), [39.4, 8.6]);
});

test("driver GPS update moves the truck marker and follows it on the live map", () => {
  const calls = [];
  const marker = { setLngLat(position) { calls.push(["marker", position]); return this; } };
  const map = { easeTo(options) { calls.push(["ease", options]); return this; } };
  updateDriverMarkerAndFollow(marker, map, [39.0, 8.9]);
  assert.deepEqual(calls[0], ["marker", [39.0, 8.9]]);
  assert.equal(calls[1][0], "ease");
  assert.deepEqual(calls[1][1].center, [39.0, 8.9]);
});
