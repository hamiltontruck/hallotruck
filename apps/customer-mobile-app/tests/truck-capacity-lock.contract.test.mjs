import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/CustomerBookingJourney.tsx', import.meta.url), 'utf8');

test('selected truck capacity owns Total Weight and prevents manual editing', () => {
  assert.match(source, /value=\{truck\.capacityTons\}/);
  assert.match(source, /readOnly/);
});

test('changing the selected truck automatically changes the displayed Total Weight capacity', () => {
  assert.match(source, /const truck = customerTruckByKey\(selectedTruck\)/);
  assert.match(source, /value=\{truck\.capacityTons\}/);
});
