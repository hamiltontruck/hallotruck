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
  create schema extensions;
  -- PGlite has no PostGIS: simulate coordinate primitives locally. The isolated
  -- Supabase preview smoke separately exercises real PostGIS geography values.
  create domain extensions.geometry as point;
  create function extensions.st_x(extensions.geometry) returns double precision
    language sql immutable as $$ select $1[0] $$;
  create function extensions.st_y(extensions.geometry) returns double precision
    language sql immutable as $$ select $1[1] $$;
  insert into pg_catalog.pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
    values (99999, 'postgis', (select oid from pg_roles where rolname = current_user),
      (select oid from pg_namespace where nspname = 'extensions'), true, 'fixture');
  create type public.order_status as enum ('placed', 'accepted', 'in_transit', 'delivered', 'cancelled');

  create table public.orders (
    id uuid primary key,
    status public.order_status not null,
    truck_id uuid,
    driver_id uuid,
    customer_id uuid,
    pickup point,
    dropoff point
  );
  create table public.tracking_pings (
    id bigint generated always as identity primary key,
    order_id uuid, driver_id uuid, location point, heading numeric,
    speed_kmh numeric, recorded_at timestamptz
  );
  alter table public.tracking_pings enable row level security;
  grant select on public.tracking_pings to authenticated;
  grant select on public.orders to authenticated;
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
  create function private.is_admin_or_ceo() returns boolean
  language sql stable as $$ select false $$;
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
  language plpgsql stable security definer set search_path = ''
  as $$
    begin
    raise exception 'Order not found or access denied';
    return query
    select o.id, o.status,
      null::double precision, null::double precision,
      null::double precision, null::double precision,
      null::double precision, null::double precision,
      null::numeric, null::numeric, null::timestamptz
    from public.orders o
    where o.id = p_order_id;
    end;
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
  insert into public.tracking_pings (order_id, driver_id, location, heading, speed_kmh, recorded_at)
    values ('${validOrder}', '${driverA}', point(39.6, 8.8), 90, 40, now());
`);
const trackingPolicies = await readFile(new URL("../supabase/migrations/20260913151910_security_rls_final_hardening.sql", import.meta.url), "utf8");
await db.exec(trackingPolicies.slice(trackingPolicies.indexOf('-- Tracking:'), trackingPolicies.indexOf('-- Driver verification:')));

const migration = await readFile(
  new URL("../supabase/migrations/20261008023352_harden_partner_live_trip_tenant_assignment.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
const positivePath = await readFile(
  new URL("../supabase/migrations/20261010224505_partner_live_positive_path.sql", import.meta.url), "utf8",
);
await db.exec(positivePath);
await db.exec("set role authenticated");

const valid = await db.query(
  "select order_id from public.partner_get_live_trip($1, $2)",
  [partnerA, validOrder],
);
assert.deepEqual(valid.rows, [{ order_id: validOrder }]);
const telemetry = await db.query("select truck_lng, truck_lat from public.partner_get_live_trip($1, $2)", [partnerA, validOrder]);
assert.deepEqual(telemetry.rows, [{ truck_lng: 39.6, truck_lat: 8.8 }]);
assert.deepEqual((await db.query("select * from public.tracking_pings")).rows, []);

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

// Independently reject truck-driver mismatch even when the fleet driver matches.
await db.exec("reset role");
await db.query("update public.trucks set driver_id = $1 where id = $2", [driverB, truckA]);
await db.exec("set role authenticated");
await assert.rejects(db.query("select * from public.partner_get_live_trip($1, $2)", [partnerA, validOrder]), /Partner live assignment mismatch/);
await db.exec("reset role");
await db.query("update public.trucks set driver_id = $1 where id = $2", [driverA, truckA]);
await db.query("update public.partner_fleet_vehicles set partner_id = $1 where id = $2", [partnerB, vehicleA]);
await db.exec("set role authenticated");
await assert.rejects(db.query("select * from public.partner_get_live_trip($1, $2)", [partnerA, validOrder]), /Active Partner trip not found/);
await db.exec("reset role; set role anon");
await assert.rejects(db.query("select * from public.partner_get_live_trip($1, $2)", [partnerA, validOrder]), /permission denied/);

await db.exec("reset role");
const base = await readFile(new URL("../supabase/migrations/20261006020000_partner_live_trip_read_access.sql", import.meta.url), "utf8");
await db.exec(base.replace("private.is_partner_member(p_partner_id)", "public.is_partner_member(p_partner_id)"));
const metadataQuery = "select pg_get_functiondef(oid) as definition, proacl::text as grants, proconfig, prosecdef, proargtypes::text as arguments, prorettype::text as result from pg_proc where oid = 'public.partner_get_live_trip(uuid,uuid)'::regprocedure";
const before = (await db.query(metadataQuery)).rows[0];
await db.exec("set role authenticated");
await assert.rejects(db.query("select * from public.partner_get_live_trip($1, $2)", [partnerA, validOrder]), /public.is_partner_member/);
await db.exec("reset role");
const correction = await readFile(new URL("../supabase/migrations/20261010224504_partner_live_membership_reference.sql", import.meta.url), "utf8");
await db.exec(correction);
const after = (await db.query(metadataQuery)).rows[0];
assert.deepEqual(after, { ...before, definition: before.definition.replace("public.is_partner_member(p_partner_id)", "private.is_partner_member(p_partner_id)") });
await db.exec(correction);
assert.deepEqual((await db.query(metadataQuery)).rows[0], after);
await db.close();
console.log("partner live operations DB authorization tests passed");
