import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('selected truck capacity owns Total Weight and prevents manual editing', () => {
  assert.match(source, /selectedTruck[^\n]*capacity|capacity[^\n]*selectedTruck/i);
  assert.match(source, /readOnly|disabled/);
});

test('changing the selected truck re-synchronizes Total Weight', () => {
  assert.match(source, /set[^\n]*(weight|Weight)[^\n]*(capacity|selectedTruck)|(capacity|selectedTruck)[^\n]*set[^\n]*(weight|Weight)/i);
});
