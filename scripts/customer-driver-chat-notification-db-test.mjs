import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const customer=id(1), driver=id(2), outsider=id(3), thread=id(4), order=id(5);
await db.exec(`
create role anon; create role authenticated;
create table profiles(id uuid primary key,full_name text);
create table orders(id uuid primary key,tracking_id text);
create table customer_driver_chat_threads(id uuid primary key,customer_id uuid,driver_id uuid,order_id uuid);
create table customer_driver_chat_messages(id uuid primary key,thread_id uuid,sender_id uuid,body text);
create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,title text,body text,data jsonb,dedupe_key text,expires_at timestamptz,
 constraint notifications_event_type_check check(event_type in ('order_assigned','payment_verified','payment_rejected','document_expiry','delivery_completed','driver_deposit_added','driver_deposit_reversed')));
create unique index notifications_dedupe on notifications(user_id,dedupe_key) where dedupe_key is not null;
create table push_notification_outbox(notification_id uuid unique,user_id uuid);
insert into profiles values('${customer}','Customer'),('${driver}','Driver');
insert into orders values('${order}','TEST-CHAT');
insert into customer_driver_chat_threads values('${thread}','${customer}','${driver}','${order}');
insert into notifications(user_id,event_type) values('${driver}','driver_deposit_added');
`);
await db.exec(await readFile('supabase/migrations/20261007034500_real_customer_driver_chat_notifications.sql','utf8'));
for (const event of ['driver_deposit_added','driver_deposit_reversed','order_assigned']) {
 await db.query(`select enqueue_user_notification($1,$2,'Test','Test','{}',$3,null)`,[driver,event,event]);
}
await db.query('insert into customer_driver_chat_messages values($1,$2,$3,$4)',[id(6),thread,customer,'Hello driver']);
await db.query('insert into customer_driver_chat_messages values($1,$2,$3,$4)',[id(7),thread,driver,'Hello customer']);
await db.query('insert into customer_driver_chat_messages values($1,$2,$3,$4)',[id(8),thread,outsider,'Not a participant']);
const chats=(await db.query("select user_id,data from notifications where event_type='chat_message' order by user_id")).rows;
assert.equal(chats.length,2);
assert.equal(chats[0].user_id,customer);
assert.equal(chats[0].data.route,'/customer/orders');
assert.equal(chats[1].user_id,driver);
assert.equal(chats[1].data.route,'/driver/trip');
await db.query(`select enqueue_user_notification($1,'chat_message','Duplicate','Duplicate','{}',$2,null)`,[driver,`chat:${thread}:${id(6)}`]);
assert.equal((await db.query("select count(*)::int as n from notifications where event_type='chat_message'")).rows[0].n,2);
assert.equal((await db.query('select count(*)::int as n from push_notification_outbox')).rows[0].n,5);
for(const role of ['anon','authenticated']) {
 assert.equal((await db.query("select has_function_privilege($1,'enqueue_user_notification(uuid,text,text,text,jsonb,text,timestamptz)','execute') as allowed",[role])).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege($1,'enqueue_customer_driver_chat_notification()','execute') as allowed",[role])).rows[0].allowed,false);
}
await db.close();
console.log('Chat notification migration preserves deposits, peer-only routing, dedupe, outbox and private ACLs: PASS');
