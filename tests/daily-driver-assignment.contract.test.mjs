import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const sql = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
  .join('\n');

const serviceDateMigration = fs.readFileSync(
  path.join(migrationDir, '20260925023000_customer_service_date_daily_driver_enforcement.sql'),
  'utf8',
);

test('database enforces one driver assignment per service date', () => {
  assert.match(sql, /guard_driver_daily_assignment/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /o\.service_date\s*=\s*v_day/i);
});

test('completed or cancelled status cannot free the service-date slot', () => {
  assert.doesNotMatch(sql, /o\.service_date\s*=\s*v_day[\s\S]{0,160}status\s+in/i);
  assert.match(sql, /before insert or update of driver_id, service_date/i);
});

test('customer booking v2 preserves the complete authoritative v1 booking contract and only adds service date', () => {
  assert.match(serviceDateMigration, /p_cargo_quantity\s+numeric/i);
  assert.match(serviceDateMigration, /p_cargo_unit\s+text/i);
  assert.match(serviceDateMigration, /p_expected_quote_etb\s+numeric/i);
  assert.match(serviceDateMigration, /p_service_date\s+date/i);
  assert.doesNotMatch(serviceDateMigration, /p_price_etb\s+numeric/i);
  assert.match(serviceDateMigration, /customer_create_booking_v1\([\s\S]*p_cargo_quantity[\s\S]*p_cargo_unit[\s\S]*p_expected_quote_etb/i);
});

test('driver availability and claim conflicts are service-date aware instead of globally blocking future jobs', () => {
  assert.match(serviceDateMigration, /claim_order_with_truck/i);
  assert.match(serviceDateMigration, /driver_available_trucks_for_order/i);
  assert.match(serviceDateMigration, /active_order\.service_date\s*=\s*v_service_date/i);
  assert.match(serviceDateMigration, /scheduled\.service_date\s*=\s*v_service_date/i);
});
