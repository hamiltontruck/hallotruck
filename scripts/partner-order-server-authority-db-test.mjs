import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const partner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const partnerActor = "11111111-1111-4111-8111-111111111111";
const adminActor = "22222222-2222-4222-8222-222222222222";
const request = (suffix) => `90000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const route = (distanceKm, durationMinutes) => ({
  provider: "openrouteservice",
  profile: "driving-hgv",
  distance_km: distanceKm,
  duration_minutes: durationMinutes,
});
const payload = (routeValue, pricing = { state: "pending_calculation" }) => ({
  pickup_location: { country: "Ethiopia", city: "Adama", address: "Adama", longitude: 39.2695, latitude: 8.5409 },
  dropoff_location: { country: "Djibouti", city: "Djibouti", address: "Djibouti", longitude: 43.1456, latitude: 11.5721 },
  cargo: { description: "Server authority fixture", weight_tons: 10 },
  vehicle_requirements: { truck_type: "Trailer" },
  schedule: {},
  pickup_contact: {},
  delivery_contact: {},
  pricing,
  payment: {},
  route: routeValue,
});

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;

  create table public.profiles(id uuid primary key, role text not null);
  create table public.partner_organizations(id uuid primary key, status text not null);
  create table public.partner_memberships(
    partner_id uuid not null,
    user_id uuid not null,
    active boolean not null,
    member_role text not null
  );
  create table public.partner_orders(
    id uuid primary key default gen_random_uuid(),
    partner_id uuid not null,
    canonical_order_id uuid,
    request_key uuid not null unique,
    reference text not null unique,
    status text not null default 'draft',
    pickup_location jsonb not null default '{}'::jsonb,
    dropoff_location jsonb not null default '{}'::jsonb,
    cargo jsonb not null default '{}'::jsonb,
    vehicle_requirements jsonb not null default '{}'::jsonb,
    schedule jsonb not null default '{}'::jsonb,
    pickup_contact jsonb not null default '{}'::jsonb,
    delivery_contact jsonb not null default '{}'::jsonb,
    pricing jsonb not null default '{}'::jsonb,
    payment jsonb not null default '{}'::jsonb,
    partner_notes text,
    admin_notes text,
    created_by uuid not null,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by uuid,
    quoted_at timestamptz,
    quoted_by uuid,
    quote_amount_etb numeric(14,2),
    quote_expires_at timestamptz,
    quote_version integer not null default 0,
    approved_at timestamptz,
    rejected_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.partner_order_status_history(
    partner_order_id uuid,
    partner_id uuid,
    from_status text,
    to_status text,
    actor_id uuid,
    reason text,
    metadata jsonb default '{}'::jsonb
  );
  create table public.partner_activity_log(
    partner_id uuid,
    actor_id uuid,
    action text,
    entity_type text,
    entity_id text,
    metadata jsonb default '{}'::jsonb
  );

  create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
  create function private.is_admin_or_ceo() returns boolean language sql stable
  as $$ select auth.uid() = '22222222-2222-4222-8222-222222222222'::uuid $$;

  create function public.calculate_transport_quote_v2(
    p_distance_km numeric,
    p_vehicle_type text,
    p_cargo_tons numeric
  ) returns table(total_quote_etb numeric)
  language sql stable security definer set search_path = ''
  as $$ select round(p_distance_km * 100 + p_cargo_tons * 10, 2) $$;

  insert into public.profiles values
    ('11111111-1111-4111-8111-111111111111', 'partner'),
    ('22222222-2222-4222-8222-222222222222', 'admin');
  insert into public.partner_organizations values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active');
  insert into public.partner_memberships values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', true, 'owner');

  create function public.partner_save_order_draft(
    p_partner_id uuid, p_order_id uuid, p_payload jsonb, p_request_key uuid
  ) returns public.partner_orders
  language plpgsql security definer set search_path = ''
  as $$
  declare v_order public.partner_orders%rowtype;
  begin
    insert into public.partner_orders(
      partner_id, request_key, reference, pickup_location, dropoff_location, cargo,
      vehicle_requirements, schedule, pickup_contact, delivery_contact, pricing,
      payment, partner_notes, created_by
    ) values (
      p_partner_id, p_request_key, 'BASE-' || replace(p_request_key::text, '-', ''),
      coalesce(p_payload->'pickup_location', '{}'::jsonb),
      coalesce(p_payload->'dropoff_location', '{}'::jsonb),
      coalesce(p_payload->'cargo', '{}'::jsonb),
      coalesce(p_payload->'vehicle_requirements', '{}'::jsonb),
      coalesce(p_payload->'schedule', '{}'::jsonb),
      coalesce(p_payload->'pickup_contact', '{}'::jsonb),
      coalesce(p_payload->'delivery_contact', '{}'::jsonb),
      coalesce(p_payload->'pricing', '{}'::jsonb),
      coalesce(p_payload->'payment', '{}'::jsonb),
      nullif(btrim(p_payload->>'partner_notes'), ''),
      auth.uid()
    ) returning * into v_order;
    return v_order;
  end;
  $$;
`);

const migration = await readFile(
  new URL("../supabase/migrations/20261010005500_harden_partner_order_server_authority.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec("set role authenticated");
await db.query("select set_config('test.actor', $1, false)", [partnerActor]);

async function save(body, key) {
  return db.query(
    "select (public.partner_save_order_draft($1::uuid, null::uuid, $2::jsonb, $3::uuid)).id",
    [partner, JSON.stringify(body), key],
  );
}

await assert.rejects(
  save(payload(route(100, 120)), request(1)),
  /Route distance cannot be shorter than straight-line distance/,
  "an impossibly low route distance must be rejected",
);
await assert.rejects(
  save(payload(route(2000, 2400)), request(2)),
  /Route distance exceeds the maximum allowed corridor factor/,
  "an implausibly inflated route distance must be rejected",
);
await assert.rejects(
  save(payload(route(650, 100)), request(3)),
  /Route ETA implies an invalid average HGV speed/,
  "a fabricated fast ETA must be rejected",
);
await assert.rejects(
  save(payload(route(650, 6000)), request(4)),
  /Route ETA implies an invalid average HGV speed/,
  "a fabricated slow ETA must be rejected",
);
await assert.rejects(
  save(payload(route(650, 780), { state: "quoted", quoted_amount_etb: 1 }), request(5)),
  /Client price or route metrics are not accepted in pricing/,
  "a client-supplied quote must be rejected",
);

const saved = await save(payload(route(650, 780)), request(6));
const orderId = saved.rows[0].id;
await db.exec("reset role");
const verified = (await db.query(
  "select route_distance_km::text, route_duration_minutes::text, route_provider, route_profile, route_verified_at is not null as verified from public.partner_orders where id=$1",
  [orderId],
)).rows[0];
assert.deepEqual(verified, {
  route_distance_km: "650.000",
  route_duration_minutes: "780.000",
  route_provider: "openrouteservice",
  route_profile: "driving-hgv",
  verified: true,
});

await db.query("update public.partner_orders set status='under_review' where id=$1", [orderId]);
await db.query("select set_config('test.actor', $1, false)", [adminActor]);
await db.exec("set role authenticated");
const quoted = (await db.query(
  "select (public.admin_quote_partner_order_v2($1::uuid, now() + interval '1 day', $2::text, $3::uuid)).quote_amount_etb::text as amount",
  [orderId, "Server-authoritative quote", request(7)],
)).rows[0];
assert.equal(quoted.amount, "65100.00");
await db.exec("reset role");
assert.equal(
  (await db.query("select pricing->>'quoted_amount_etb' as amount from public.partner_orders where id=$1", [orderId])).rows[0].amount,
  "65100.00",
);

assert.equal(
  (await db.query("select to_regprocedure('public.admin_quote_partner_order_v2(uuid,timestamptz,text,uuid)') is not null as exists")).rows[0].exists,
  true,
  "the V2 quote RPC must not accept a client price argument",
);

await db.close();
console.log("Partner order server-authority database tests passed.");
