import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Disposable PostgreSQL-compatible engine, synthetic tables and principals only.
const db = new PGlite();
let checks=0;
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create function private.is_admin_or_ceo() returns boolean language sql stable as $$
      select current_setting('qa.role',true) in ('admin','ceo') $$;
    create function private.normalize_fleet_plate(text) returns text language sql immutable as $$
      select upper(regexp_replace(btrim(coalesce($1,'')), '[^A-Za-z0-9]+','','g')) $$;
    create table public.trucks(id uuid primary key, plate_key text unique, gps_provider text, gps_external_id text, partner_id uuid, driver_id uuid);
    create table public.fleet_audit_events(id bigint generated always as identity, entity_type text, entity_id uuid, truck_id uuid, partner_id uuid, subject_driver_id uuid, event_type text, reason text, old_values jsonb, new_values jsonb, actor_id uuid, source text);
    insert into public.trucks(id,plate_key) values
      ('00000000-0000-4000-8000-000000000001','AA123'),
      ('00000000-0000-4000-8000-000000000002','AA456');
  `);
  await db.exec(await readFile('supabase/migrations/20261128015726_admin_link_fleet_gps.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261128015948_mask_fleet_gps_audit_identifiers.sql','utf8'));
  const principal=async role=>db.query(`select set_config('qa.uid',$1,false),set_config('qa.role',$2,false)`,[role==='anonymous'?'':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role]);
  const link=(plate,imei)=>db.query('select public.admin_link_fleet_gps($1,$2)',[plate,imei]);
  for(const role of ['anonymous','customer','driver','partner']) {
    await principal(role); await assert.rejects(()=>link('AA123','123456789012345'), /Admin or CEO/); checks++;
  }
  await db.exec('set role anon');
  await assert.rejects(()=>link('AA123','123456789012345'),/permission denied/); checks++;
  await db.exec('reset role');
  await principal('admin');
  for(const value of ['', '123', '12345678901234X', '1234567890123456']) {await assert.rejects(()=>link('AA123',value),/15-digit/); checks++;}
  await assert.rejects(()=>link('unknown','123456789012345'),/No registered/); checks++;
  await db.exec('set role authenticated');
  await link(' aa-123 ',' 123456789012345 ');
  await assert.rejects(()=>db.exec("update trucks set gps_external_id='999999999999999'"),/permission denied/); checks++;
  await db.exec('reset role');
  assert.equal((await db.query("select gps_external_id from trucks where plate_key='AA123'")).rows[0].gps_external_id,'123456789012345'); checks++;
  await link('AA123','123456789012345'); checks++;
  await assert.rejects(()=>link('AA456','123456789012345'),/already linked to another/); checks++;
  await assert.rejects(()=>link('AA123','223456789012345'),/already has/); checks++;
  await principal('ceo'); await link('AA456','223456789012345'); checks++;
  const audit=(await db.query('select * from fleet_audit_events order by id')).rows;
  assert.equal(audit.length,2,'Each new GPS link must produce one audit event; retries must not duplicate it'); checks++;
  assert.equal(audit[0].event_type,'profile_updated'); checks++;
  assert.equal(audit[0].source,'admin'); checks++;
  assert.equal(audit[0].actor_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); checks++;
  assert.deepEqual(audit[0].old_values, { gps_provider: null, gps_imei_last4: null }); checks++;
  assert.deepEqual(audit[0].new_values, { gps_provider: 'traccar', gps_imei_last4: '2345' }); checks++;
  console.log(`PASS Admin GPS linking: ${checks} authorization, validation, uniqueness, retry and audit checks`);
} finally {await db.close();}
