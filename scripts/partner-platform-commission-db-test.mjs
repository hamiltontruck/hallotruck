import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const partner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const admin = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const order = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema private;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
  create function private.is_admin_or_ceo() returns boolean language sql as $$ select auth.uid()='${admin}'::uuid $$;
  create table partner_organizations(id uuid primary key,status text);
  create table partner_orders(id uuid primary key default gen_random_uuid(),partner_id uuid,canonical_order_id uuid unique);
  create table partner_commission_rules(partner_id uuid,active boolean,effective_from date,effective_to date,created_at timestamptz,commission_type text,commission_value numeric);
  create table payments(order_id uuid,event text,amount_etb numeric);
  create table partner_fleet_vehicles(id uuid,partner_id uuid);
  create table partner_projects(id uuid,partner_id uuid);
  create table partner_freight_earnings(id uuid default gen_random_uuid(),partner_id uuid,project_id uuid,order_id uuid unique,vehicle_id uuid,gross_etb numeric,commission_type text,commission_value numeric,hallo_commission_etb numeric,partner_net_etb numeric,created_by uuid);
  create table partner_activity_log(partner_id uuid,actor_id uuid,action text,entity_type text,entity_id text,metadata jsonb);
  insert into partner_organizations values('${partner}','active'),('${other}','active');
  insert into partner_commission_rules values('${partner}',true,current_date,null,now(),'percentage',2);
`);
await db.exec(await readFile("supabase/migrations/20261011150000_partner_platform_commission.sql", "utf8"));
await db.exec(await readFile("supabase/migrations/20260901090000_harden_partner_freight_accrual_org_status.sql", "utf8"));
await db.query("select set_config('test.actor',$1,false)", [admin]);
async function fixture(n, amount, platform = true) {
  if (platform) await db.query("insert into partner_orders(partner_id,canonical_order_id) values($1,$2)", [partner, order(n)]);
  await db.query("insert into payments values($1,'released',$2)", [order(n), amount]);
}
async function accrue(n, organization = partner) {
  return db.query("select public.admin_record_partner_freight($1::uuid,$2::uuid,null::uuid)", [organization, order(n)]);
}
await fixture(1, 100000); await accrue(1);
const money = (await db.query("select gross_etb::text,hallo_commission_etb::text,partner_net_etb::text,commission_value::text from partner_freight_earnings where order_id=$1", [order(1)])).rows[0];
assert.equal(Number(money.hallo_commission_etb), 250);
assert.equal(Number(money.partner_net_etb), 99750);
assert.equal(Number(money.commission_value), 0.25);
await assert.rejects(accrue(1), /unique constraint/);
await fixture(2, 100000, false); await accrue(2);
assert.equal(Number((await db.query("select hallo_commission_etb from partner_freight_earnings where order_id=$1", [order(2)])).rows[0].hallo_commission_etb), 2000);
await fixture(3, 100000);
await assert.rejects(accrue(3, other), /another Partner/);
await db.query("select set_config('test.actor',$1,false)", [actor]);
await assert.rejects(accrue(3), /Admin or CEO/);
await db.query("select set_config('test.actor',$1,false)", [admin]);
await db.query("update partner_organizations set status='suspended' where id=$1", [partner]);
await assert.rejects(accrue(3), /Active Partner/);
await db.query("update partner_organizations set status='active' where id=$1", [partner]);
await fixture(4, 100000);
await db.query("insert into payments values($1,'refunded',20000)", [order(4)]); await accrue(4);
const refunded = (await db.query("select hallo_commission_etb,partner_net_etb from partner_freight_earnings where order_id=$1", [order(4)])).rows[0];
assert.equal(Number(refunded.hallo_commission_etb), 200);
assert.equal(Number(refunded.partner_net_etb), 79800);
await fixture(5, 0); await assert.rejects(accrue(5), /effective released payment/);
await fixture(6, 1); await accrue(6);
assert.equal(Number((await db.query("select hallo_commission_etb from partner_freight_earnings where order_id=$1", [order(6)])).rows[0].hallo_commission_etb), 0);
await db.exec("delete from partner_commission_rules");
await fixture(7, 100000); await accrue(7);
await fixture(8, 100000, false); await assert.rejects(accrue(8), /No active Partner commission rule/);
assert.equal((await db.query("select count(*)::int as n from partner_activity_log")).rows[0].n, 5);
await db.close();
console.log("Partner platform fee: 0.25%, legacy 2% unchanged, authorization, tenant, refunds, rounding, duplicate and no-payment guards PASS");
