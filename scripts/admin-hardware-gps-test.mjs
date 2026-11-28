import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp = await mkdtemp(join(tmpdir(), 'hallo-hardware-gps-'));
try {
  const output = join(temp, 'core.mjs');
  await build({ entryPoints: ['supabase/functions/admin-hardware-gps/core.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm' });
  const { createHardwareGpsHandler } = await import(pathToFileURL(output));
  const truck = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const now = Date.parse('2026-11-28T18:10:00Z');
  const link = { id: truck, plate_number: 'QA-123', gps_provider: 'traccar', gps_external_id: '001234567890123' };
  const fix = { id: 101, deviceId: 3, protocol: 'gt06', valid: true, latitude: 9, longitude: 38, speed: 10, course: 90, fixTime: '2026-11-28T18:09:30Z' };
  let user = { role: 'admin', driver_status: null };
  let links = [link]; let devices = [{ id: 3, uniqueId: link.gps_external_id }]; let positions = [fix];
  let reads = 0; let mappingReads = 0; let upstreamError = false;
  const handler = createHardwareGpsHandler({
    authorize: async token => token === 'fixture-user-token' ? user : null,
    loadTrucks: async ids => { mappingReads++; return links.filter(t => ids.includes(t.id)); },
    readSnapshot: async () => { reads++; if (upstreamError) throw new Error('SECRET MUST NEVER LEAK'); return { devices, positions }; },
    now: () => now,
  });
  const request = (body = { truckIds: [truck] }, token = 'fixture-user-token', origin = 'https://hamiltontruck.github.io') => new Request('https://example.supabase.co/functions/v1/admin-hardware-gps', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: origin }, body: JSON.stringify(body) });
  let checks = 0;
  const status = async (req, code) => { const response = await handler(req); assert.equal(response.status, code); checks++; return response; };
  await status(request(undefined, ''), 401);
  await status(request(undefined, 'bad-token'), 401);
  for (const role of ['customer', 'driver', 'partner']) { user = { role }; await status(request(), 403); }
  user = { role: 'admin', driver_status: 'suspended' }; await status(request(), 403);
  assert.equal(reads, 0); assert.equal(mappingReads, 0); checks++;
  user = { role: 'admin' };
  await status(request(undefined, undefined, 'https://evil.example'), 403);
  for (const body of [{}, { truckIds: ["invalid"] }, { truckIds: Array(21).fill(truck) }, { truckIds: [truck], url: 'https://evil.example' }]) await status(request(body), 400);
  const response = await status(request(), 200);
  const result = await response.json();
  const point = result.positions[0];
  assert.equal(point.truck_id, truck); checks++;
  assert.equal(point.plate_number, 'QA-123'); checks++;
  assert.equal(point.source, 'traccar'); checks++;
  assert.equal(point.recorded_at, '2026-11-28T18:09:30.000Z'); checks++;
  assert.equal(point.location.speed_kmh, 18.52); checks++;
  assert.equal(point.location.longitude, 38); checks++;
  assert.equal(point.status, 'LIVE'); checks++;
  assert.equal(JSON.stringify(result).includes(link.gps_external_id), false); checks++;
  user = { role: 'ceo' }; await status(request(), 200); user = { role: 'admin' };
  const prior = reads;
  assert.deepEqual((await (await status(request({ truckIds: [other] }), 200)).json()).positions, []); checks++;
  assert.equal(reads, prior); checks++;
  for (const change of [{ valid: false }, { valid: undefined }, { deviceId: 99 }, { protocol: 'unknown' }, { latitude: null }, { latitude: 91 }, { speed: -1 }, { course: 360 }, { fixTime: '2026-11-28T18:11:00Z' }, { fixTime: '2026-02-30T00:00:00Z' }]) {
    positions = [{ ...fix, ...change }];
    const row = (await (await status(request(), 200)).json()).positions[0];
    assert.equal(row.location, null); assert.equal(row.status, 'OFFLINE'); checks++;
  }
  positions = [{ ...fix, fixTime: '2026-11-28T18:09:30.000+00:00' }];
  assert.equal((await (await status(request(), 200)).json()).positions[0].status, 'LIVE'); checks++;
  positions = [{ ...fix, fixTime: '2026-11-28T18:00:00Z' }];
  assert.equal((await (await status(request(), 200)).json()).positions[0].status, 'STALE'); checks++;
  positions = [{ ...fix, fixTime: '2026-11-28T16:00:00Z' }];
  assert.equal((await (await status(request(), 200)).json()).positions[0].status, 'OFFLINE'); checks++;
  positions = [fix, { ...fix, id: 102, valid: false, fixTime: '2026-11-28T18:09:45Z' }];
  assert.equal((await (await status(request(), 200)).json()).positions[0].location, null); checks++;
  devices = [{ id: 3, uniqueId: link.gps_external_id }, { id: 4, uniqueId: link.gps_external_id }]; positions = [fix];
  assert.equal((await (await status(request(), 200)).json()).positions[0].location, null); checks++;
  upstreamError = true;
  const unavailable = await status(request(), 503);
  assert.equal((await unavailable.text()).includes('SECRET'), false); checks++;
  const preflight = await handler(new Request('https://example', { method: 'OPTIONS', headers: { Origin: 'https://hamiltontruck.github.io' } }));
  assert.equal(preflight.status, 200); checks++;
  console.log(`PASS Admin hardware GPS: ${checks} authentication, mapping, validation, freshness, scope and error-sanitization checks`);
} finally { await rm(temp, { recursive: true, force: true }); }
