// Isolated PostgreSQL contract test: runs the actual migration and authorization
// function against fixture tables. It never connects to Supabase or production.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const driver = "00000000-0000-4000-8000-000000000001";
const truck = "00000000-0000-4000-8000-000000000002";
const admin = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000004";
const sqlFile = (name) => readFile(`supabase/migrations/${name}.sql`, "utf8");
let passed = 0;
async function rejects(sql, args, code) {
  await assert.rejects(db.query(sql, args), (error) => error.code === code);
  passed++;
}
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private; create schema storage;
    create type public.driver_status as enum ('pending','approved','suspended');
    create table profiles(id uuid primary key, full_name text, role text, driver_status public.driver_status);
    create table trucks(id uuid primary key, driver_id uuid, created_by uuid, vehicle_type text, status text, updated_at timestamptz default now());
    create table orders(id uuid primary key default gen_random_uuid(), driver_id uuid, truck_id uuid, status text);
    create table storage.objects(bucket_id text, name text);
    create table driver_verification_files(id uuid primary key default gen_random_uuid(), driver_id uuid, truck_id uuid, document_key text, file_path text, original_name text, mime_type text, expiry_date date, status text, rejection_reason text, reviewed_by uuid, reviewed_at timestamptz, updated_at timestamptz default now(), submitted_by uuid, submission_source text, source_note text);
    create unique index identity_file on driver_verification_files(driver_id,document_key) where truck_id is null;
    create unique index truck_file on driver_verification_files(truck_id,document_key) where truck_id is not null;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    insert into profiles values ('${driver}','Driver','driver','pending'),('${admin}','Admin','admin','approved'),('${other}','Other','driver','pending');
    insert into trucks(id,driver_id,created_by,vehicle_type,status) values ('${truck}','${driver}','${driver}','Isuzu 5 Ton','inactive');
  `);
  const leadership = await sqlFile("20260829173000_harden_suspended_leadership_authorization");
  const begin = leadership.indexOf("create or replace function private.require_active_leadership(");
  await db.exec(leadership.slice(begin, leadership.indexOf("\n$function$;", begin) + 12));
  const legacy = await sqlFile("20260822222326_driver_collections_and_admin_manual_documents");
  const start = legacy.indexOf("create or replace function public.admin_upsert_driver_document(");
  await db.exec(legacy.slice(start, legacy.indexOf("\n$$;", start) + 4).replace("public.admin_upsert_driver_document(", "public.admin_upsert_driver_document_unchecked_188("));
  await db.exec("revoke all on function public.admin_upsert_driver_document_unchecked_188(uuid,uuid,text,text,text,text,date,boolean,text) from public,anon,authenticated;");
  await db.exec(await sqlFile("20260913010906_compact_driver_verification"));
  await db.query("select set_config('test.actor',$1,false)", [admin]);
  const keys = ["driver_photo","license_front","license_back","national_id_front","national_id_back","vehicle_registration","truck_front","truck_side"];
  for (const [index,key] of keys.entries()) await db.query("insert into driver_verification_files(driver_id,truck_id,document_key,file_path,status,expiry_date) values($1,$2,$3,$3,'verified',$4)", [driver,index<5?null:truck,key,["license_front","national_id_front"].includes(key)?"2099-12-31":"2000-01-01"]);
  await db.query("select admin_approve_driver_onboarding($1)", [driver]);
  assert.equal((await db.query("select driver_status from profiles where id=$1", [driver])).rows[0].driver_status,"approved"); passed++;
  assert.equal((await db.query("select status from trucks where id=$1",[truck])).rows[0].status,"available"); passed++;
  // Pending/missing or evidence attached to another driver cannot count.
  await db.exec("update driver_verification_files set status='pending' where document_key='truck_side'");
  await rejects("select admin_approve_driver_onboarding($1)",[driver],"23514");
  await db.exec(`update driver_verification_files set status='verified', driver_id='${other}' where document_key='truck_side'`);
  await rejects("select admin_approve_driver_onboarding($1)",[driver],"23514");
  await db.exec(`update driver_verification_files set driver_id='${driver}' where document_key='truck_side'`);
  for (const key of ["license_front", "national_id_front"]) {
    for (const expiry of [null,"2000-01-01"]) {
      await db.query("update driver_verification_files set expiry_date=$1 where document_key=$2",[expiry,key]);
      await rejects("select admin_approve_driver_onboarding($1)",[driver],"23514");
    }
    await db.query("update driver_verification_files set expiry_date='2099-12-31' where document_key=$1",[key]);
  }
  // Current DB role wins over session claims; suspended leadership cannot mutate.
  await db.query("update profiles set driver_status='suspended' where id=$1",[admin]);
  await rejects("select admin_approve_driver_onboarding($1)",[driver],"42501");
  await db.query("update profiles set driver_status='approved' where id=$1",[admin]);
  for (const key of ["license_front", "national_id_front"]) {
    const front = (await db.query("select id from driver_verification_files where document_key=$1",[key])).rows[0].id;
    await db.query("update driver_verification_files set status='pending',expiry_date='2000-01-01' where id=$1",[front]);
    await rejects("select admin_review_driver_verification_document($1,'stale-path','verified',null)",[front],"40001");
    await rejects("select admin_review_driver_verification_document($1,$2,'verified',null)",[front,key],"23514");
    await db.query("update driver_verification_files set expiry_date=current_date where id=$1",[front]);
    await db.query("select admin_review_driver_verification_document($1,$2,'verified',null)",[front,key]); passed++;
    await rejects("select admin_review_driver_verification_document($1,$2,'verified',null)",[front,key],"40001");
    const filePath = `${driver}/admin/${key}/new.jpg`;
    await db.query("insert into storage.objects values('driver-verification',$1)",[filePath]);
    await rejects("select admin_upsert_driver_document($1,null,$2,$3,'new.jpg','image/jpeg',null,true,null)",[driver,key,filePath],"23514");
    await db.query("select admin_upsert_driver_document($1,null,$2,$3,'new.jpg','image/jpeg','2099-12-31',true,null)",[driver,key,filePath]);
    assert.equal((await db.query("select expiry_date::text from driver_verification_files where id=$1",[front])).rows[0].expiry_date,"2099-12-31"); passed++;
  }
  // Neither back requests, stores or validates a second expiry date.
  for (const key of ["license_back", "national_id_back"]) {
    const back = (await db.query("select id from driver_verification_files where document_key=$1",[key])).rows[0].id;
    await db.query("update driver_verification_files set status='pending' where id=$1",[back]);
    await db.query("select admin_review_driver_verification_document($1,$2,'verified',null)",[back,key]); passed++;
    const filePath = `${driver}/admin/${key}/new.jpg`;
    await db.query("insert into storage.objects values('driver-verification',$1)",[filePath]);
    await db.query("select admin_upsert_driver_document($1,null,$2,$3,'new.jpg','image/jpeg','2000-01-01',true,null)",[driver,key,filePath]);
    assert.equal((await db.query("select expiry_date from driver_verification_files where id=$1",[back])).rows[0].expiry_date,null); passed++;
  }
  await rejects("select admin_upsert_driver_document($1,null,'driver_photo',$2,'new.pdf','application/pdf',null,true,null)",[driver,`${driver}/photo.pdf`],"23514");
  const save="select admin_save_driver_review_fields($1,$2,$3,$4,$5,$6,$7,$8)";
  await db.query(save,[driver,truck,"Updated Driver","Isuzu 5 Ton","FSR","Driver","Isuzu 5 Ton",null]);
  assert.equal((await db.query("select model from trucks where id=$1",[truck])).rows[0].model,"FSR"); passed++;
  await rejects(save,[driver,truck,"Wrong","Isuzu 5 Ton","FSR","Driver","Isuzu 5 Ton",null],"40001");
  await rejects(save,[other,truck,"Other","Isuzu 5 Ton","FSR","Other","Isuzu 5 Ton","FSR"],"23514");
  await rejects(save,[driver,truck,"Updated Driver","INVALID","FSR","Updated Driver","Isuzu 5 Ton","FSR"],"23514");
  await db.query("insert into orders(driver_id,truck_id,status) values($1,$2,'in_transit')",[driver,truck]);
  await rejects(save,[driver,truck,"Updated Driver","Van","FSR","Updated Driver","Isuzu 5 Ton","FSR"],"23514");
  await db.query("select set_config('test.actor',$1,false)",[driver]);
  await rejects(save,[driver,truck,"Updated Driver","Isuzu 5 Ton","FSR","Updated Driver","Isuzu 5 Ton","FSR"],"42501");
  for(const name of ["admin_save_driver_review_fields(uuid,uuid,text,text,text,text,text,text)","admin_approve_driver_onboarding(uuid)","admin_review_driver_verification_document(uuid,text,text,text)"]){
    assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') as allowed",[name])).rows[0].allowed,false); passed++;
  }
  console.log(`Compact driver PostgreSQL contracts passed: ${passed} assertions (fixture database, no production access).`);
} finally { await db.close(); }
