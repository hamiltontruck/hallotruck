import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/CustomerTrackingPage.tsx', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/CustomerTrackingMap.tsx', import.meta.url), 'utf8');

test('tracking page exposes a full live tracking surface', () => {
  assert.match(page, /customer-track-full-map/);
  assert.match(page, /CustomerTrackingMap/);
});

test('tracking map exposes truck marker and offline last-known state', () => {
  assert.match(map, /createMarkerElement\(kind: "pickup" \| "dropoff" \| "truck"/);
  assert.match(map, /GPS OFFLINE/);
  assert.match(map, /last known location/i);
});
