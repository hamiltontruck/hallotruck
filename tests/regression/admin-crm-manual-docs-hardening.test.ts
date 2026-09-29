import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const crm = readFileSync('src/pages/AdminCrmRegistry.tsx', 'utf8');
const manualDocs = readFileSync('src/pages/AdminManualDriverDocuments.tsx', 'utf8');
const migrationPath = 'supabase/migrations/20260929230908_admin_manual_driver_vehicle_link.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

test('Admin CRM uses compact smart cards instead of a seven-column stretched desktop grid', () => {
  assert.match(crm, /CRM smart row/);
  assert.doesNotMatch(crm, /grid-cols-\\[130px_minmax\\(180px,1\\.4fr\\)_110px_90px_120px_130px_120px\\]/);
  assert.doesNotMatch(crm, /grid-cols-\\[130px_minmax\\(170px,1\\.3fr\\)_110px_150px_100px_100px_110px\\]/);
});

test('manual vehicle document intake can link an unassigned company truck to a pending driver safely', () => {
  assert.match(manualDocs, /admin_link_driver_onboarding_truck/);
  assert.match(manualDocs, /onboardingTruckCandidates/);
  assert.match(migration, /create or replace function public\.admin_link_driver_onboarding_truck/);
  assert.match(migration, /driver_status::text <> 'suspended'/);
  assert.match(migration, /status = 'inactive'/);
  assert.match(migration, /partner_id is not null/);
  assert.match(migration, /grant execute on function public\.admin_link_driver_onboarding_truck\(uuid, uuid\) to authenticated/);
});
