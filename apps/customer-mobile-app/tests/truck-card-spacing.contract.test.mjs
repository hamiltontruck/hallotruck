import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/customer-final-ui.css', import.meta.url), 'utf8');

test('truck selection cards have an explicit mobile gap', () => {
  assert.match(css, /\.customer-final-truck-list\s*\{[^}]*gap\s*:\s*[^;}]+/s);
});
