import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const partnerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const partnerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const driverA = "daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const driverB = "dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const truckA = "1aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const truckB = "1bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const vehicleA = "2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const vehicleMismatch = "2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const validOrder = "3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mismatchOrder = "3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const crossTenantOrder = "3ccccccc-cccc-4ccc-8ccc-cccccccccccc";
const unconfirmedOrder = "3ddddddd-dddd-4ddd-8ddd-dddddddddddd";
const inactiveOrder = "3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;
  create type public.order_status as enum ('placed', 'accepted', 'in_transit', 'delivered', 'cancelled');

  create table public.orders (
    id uuid primary key,
    status public.order_status not null,
    truck_id uuid,
    driver_id uuid
  );
  create table public.trucks (
    id uuid primary key,
    partner_id uuid,
    driver_id uuid
  );
  create table public.partner_fleet_vehicles (
    id uuid primary key,
    partner_id uuid not null,
    truck_id uuid not null,
    assigned_driver_id uuid
  );
  create table public.partner_job_requests (
    order_id uuid not null,
    partner_id uuid not null,
    status text not null,
    selected_partner_vehicle_id uuid,
    selected_truck_id uuid,
    selected_driver_id uuid
  );

  create function auth.uid() returns uuid
  language sql stable as $$ select 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
  create function private.is_partner_member(p_partner_id uuid) returns boolean
  language sql stable as $$ select p_partner_id = '${partnerA}'::uuid $$;
  create function public.customer_get_live_trip_unchecked_188(p_order_id uuid)
  returns table(
    order_id uuid,
    status public.order_status,
    pickup_lng double precision,
    pickup_lat double precision,
    dropoff_lng double precision,
    dropoff_lat double precision,
    truck_lng double precision,
    truck_lat double precision,
    heading numeric,
    speed_kmh numeric,
    recorded_at timestamptz
  )
  language sql stable security definer set search_path = ''
  as $$
    select o.id, o.status,
      null::double precision, null::double precision,
      null::double precision, null::double precision,
      null::double precision, null::double precision,
      null::numeric, null::numeric, null::timestamptz
    from public.orders o
    where o.id = p_order_id
  $$;

  insert into public.trucks (id, partner_id, driver_id) values
    ('${truckA}', '${partnerA}', '${driverA}'),
    ('${truckB}', '${partnerB}', '${driverA}');
  insert into public.partner_fleet_vehicles (id, partner_id, truck_id, assigned_driver_id) values
    ('${vehicleA}', '${partnerA}', '${truckA}', '${driverA}'),
    ('${vehicleMismatch}', '${partnerA}', '${truckA}', '${driverB}');
  insert into public.orders (id, status, truck_id, driver_id) values
    ('${validOrder}', 'accepted', '${truckA}', '${driverA}'),
    ('${mismatchOrder}', 'accepted', '${truckA}', '${driverA}'),
    ('${crossTenantOrder}', 'accepted', '${truckB}', '${driverA}'),
    ('${unconfirmedOrder}', 'accepted', '${truckA}', '${driverA}'),
    ('${inactiveOrder}', 'placed', '${truckA}', '${driverA}');
  insert into public.partner_job_requests (
    order_id, partner_id, status, selected_partner_vehicle_id, selected_truck_id, selected_driver_id
  ) values
    ('${validOrder}', '${partnerA}', 'confirmed', '${vehicleA}', '${truckA}', '${driverA}'),
    ('${mismatchOrder}', '${partnerA}', 'confirmed', '${vehicleMismatch}', '${truckA}', '${driverA}'),
    ('${crossTenantOrder}', '${partnerA}', 'confirmed', '${vehicleA}', '${truckB}', '${driverA}'),
    ('${unconfirmedOrder}', '${partnerA}', 'pending', '${vehicleA}', '${truckA}', '${driverA}'),
    ('${inactiveOrder}', '${partnerA}', 'confirmed', '${vehicleA}', '${truckA}', '${driverA}');
`);

const migration = await readFile(
  new URL("../supabase/migrations/20261008023352_harden_partner_live_trip_tenant_assignment.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec("set role authenticated");

const valid = await db.query(
  "select order_id from public.partner_get_live_trip($1, $2)",
  [partnerA, validOrder],
);
assert.deepEqual(valid.rows, [{ order_id: validOrder }]);

await assert.rejects(
  db.query("select * from public.partner_get_live_trip($1, $2)", [partnerA, mismatchOrder]),
  /Partner live assignment mismatch: fleet and order drivers differ/,
);
for (const orderId of [crossTenantOrder, unconfirmedOrder, inactiveOrder]) {
  await assert.rejects(
    db.query("select * from public.partner_get_live_trip($1, $2)", [partnerA, orderId]),
    /Active Partner trip not found/,
  );
}
await assert.rejects(
  db.query("select * from public.partner_get_live_trip($1, $2)", [partnerB, validOrder]),
  /Partner membership required/,
);

await db.close();
console.log("partner live operations DB authorization tests passed");
