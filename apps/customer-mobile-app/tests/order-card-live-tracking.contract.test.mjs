import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const orders = fs.readFileSync(new URL('../src/CustomerOrdersV4Page.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/CustomerTrackingPage.tsx', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/CustomerTrackingMap.tsx', import.meta.url), 'utf8');

test('Order Card exposes inline live tracking and a separate full live tracking action only for active assigned trips', () => {
  assert.match(orders, /Live trip tracking/);
  assert.match(orders, /Full live tracking/);
  assert.match(orders, /CustomerOrderLiveTrackingPreview/);
  assert.doesNotMatch(orders, /CUSTOMER_TRACKABLE_STATUSES = new Set\([^\n]*delivered/);
});

test('full tracking exposes manual refresh and portal-grade GPS context', () => {
  assert.match(page, /Refresh live position/);
  assert.match(map, /Last GPS update/);
  assert.match(map, /data-truck-bearing/);
  assert.match(map, /GPS STALE/);
  assert.match(map, /GPS OFFLINE/);
});
