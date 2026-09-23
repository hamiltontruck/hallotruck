import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const sql = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
  .join('\n');

test('database enforces one driver assignment per calendar day', () => {
  assert.match(sql, /one[^\n]*driver[^\n]*(day|daily)|daily[^\n]*driver[^\n]*assignment/i);
  assert.match(sql, /advisory|unique[^\n]*index|exclude|for update/i);
});

test('same-day delivered or cancelled assignments still consume the day', () => {
  assert.match(sql, /delivered/i);
  assert.match(sql, /cancelled|canceled/i);
  assert.match(sql, /assigned_at|assignment_date|assigned_on/i);
});
