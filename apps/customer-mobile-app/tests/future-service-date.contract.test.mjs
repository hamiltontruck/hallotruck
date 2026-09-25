import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const flow = fs.readFileSync(new URL('../src/CustomerBookingFlowV2.tsx', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/customer-order.service-v2.ts', import.meta.url), 'utf8');
const migrationDir = path.resolve('../../supabase/migrations');
const sql = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8')).join('\n');

test('Customer booking requires an authoritative service date and persists it', () => {
  assert.match(flow, /serviceDate/);
  assert.match(flow, /type="date"/);
  assert.match(service, /serviceDate/);
  assert.match(service, /service_date:\s*input\.serviceDate/);
  assert.match(sql, /add column if not exists service_date date/);
});

test('service date cannot be in the past', () => {
  assert.match(flow, /min=\{todayServiceDate\}/);
  assert.match(sql, /new\.service_date\s*<\s*\(now\(\) at time zone 'Africa\/Addis_Ababa'\)::date/i);
});