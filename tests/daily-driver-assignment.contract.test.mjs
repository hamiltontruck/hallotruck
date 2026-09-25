import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const sql = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
  .join('\n');

test('database enforces one driver assignment per service date', () => {
  assert.match(sql, /guard_driver_daily_assignment/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /o\.service_date\s*=\s*v_day/i);
});

test('completed or cancelled status cannot free the service-date slot', () => {
  assert.doesNotMatch(sql, /o\.service_date\s*=\s*v_day[\s\S]{0,160}status\s+in/i);
  assert.match(sql, /before insert or update of driver_id, service_date/i);
});