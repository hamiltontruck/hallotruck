import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('truck selection cards have an explicit mobile gap', () => {
  assert.match(css, /truck[^\{]*\{[^\}]*gap\s*:|truck[^\{]*\{[^\}]*margin/i);
});
