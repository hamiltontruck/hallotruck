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
test('service-date migration preserves legacy order history instead of backfilling it', () => {
  const migration = fs.readFileSync(path.join(migrationDir, '20260925212158_customer_service_date_daily_driver_enforcement.sql'), 'utf8');
  assert.doesNotMatch(migration, /update\s+public\.orders\s+set\s+service_date\s*=\s*\(created_at/i);
  assert.doesNotMatch(migration, /alter\s+column\s+service_date\s+set\s+not\s+null/i);
  assert.match(migration, /if\s+tg_op\s*=\s*'INSERT'[\s\S]*new\.service_date\s+is\s+null/i);
});

test('customer-owned inserts cannot pre-assign an arbitrary driver', () => {
  const migration = fs.readFileSync(path.join(migrationDir, '20260925212158_customer_service_date_daily_driver_enforcement.sql'), 'utf8');
  assert.match(migration, /tg_op\s*=\s*'INSERT'[\s\S]*auth\.uid\(\)\s*=\s*new\.customer_id[\s\S]*new\.driver_id\s+is\s+not\s+null/i);
  assert.match(migration, /Customers cannot assign a driver during order creation/i);
});
