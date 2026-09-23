import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('orders expose live and full live tracking actions', () => {
  assert.match(source, /Live trip tracking/i);
  assert.match(source, /Open full live tracking/i);
});

test('tracking exposes truck marker and offline last-known state', () => {
  assert.match(source, /truck[^\n]*(marker|arrow)|(marker|arrow)[^\n]*truck/i);
  assert.match(source, /OFFLINE|Last Known/i);
});
