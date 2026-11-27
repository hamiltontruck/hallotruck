import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTraccarClient, ensureRegistered, validateMappings } from "./qa-client.mjs";
import { openPositionStore, syncPositions } from "./position-store.mjs";

const now = Date.parse("2026-11-20T12:00:00Z");
const mapping = { uniqueId: "0012345678", name: "Synthetic ST-906L", truckId: "qa-truck" };
const device = { id: 42, uniqueId: mapping.uniqueId, name: mapping.name };
const position = (id, age, extra = {}) => ({
  id, deviceId: device.id, protocol: "h02", valid: true, latitude: 9, longitude: 38,
  speed: 10, course: 90, fixTime: new Date(now - age).toISOString(), ...extra,
});

test("device IDs retain leading zeroes and are unique across trucks", () => {
  assert.deepEqual(validateMappings([mapping]), [mapping]);
  assert.throws(() => validateMappings([mapping, { ...mapping, truckId: "another" }]), /Duplicate/);
  assert.throws(() => validateMappings([mapping, { ...mapping, uniqueId: "other" }]), /Duplicate/);
  assert.throws(() => validateMappings([{ ...mapping, uniqueId: 123 }]), /Invalid/);
});

test("registration is idempotent and rejects a conflicting assignment", async () => {
  const devices = [];
  const operator = {
    devices: async () => devices,
    register: async ({ uniqueId, name }) => {
      const created = { id: 42, uniqueId, name };
      devices.push(created);
      return created;
    },
  };
  assert.deepEqual(await ensureRegistered(operator, mapping), device);
  assert.deepEqual(await ensureRegistered(operator, mapping), device);
  assert.equal(devices.length, 1);
  await assert.rejects(ensureRegistered(operator, { ...mapping, name: "Other tracker" }), /conflict/i);
});

test("QA API confines secrets to the approved origin and refuses redirects", async () => {
  const options = { token: "synthetic-token" };
  assert.throws(() => createTraccarClient({ ...options, baseUrl: "https://other.example" }), /QA origin/);
  assert.throws(() => createTraccarClient({ ...options, baseUrl: "http://traccar-qa-qa.up.railway.app" }), /QA origin/);
  const api = createTraccarClient({ ...options, fetchImpl: async (url, init) => {
    assert.equal(url.pathname, "/api/devices");
    assert.equal(init.headers.Authorization, "Bearer synthetic-token");
    assert.equal(init.redirect, "error");
    return new Response("synthetic-token", { status: 401 });
  } });
  await assert.rejects(api.devices(), /^Error: Traccar API HTTP 401$/);
});

test("reconnect replays late history without duplicates or rolling back the latest fix", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "hallo-gps-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const dbFile = join(folder, "state.sqlite");
  let store = openPositionStore(dbFile);
  let rows = [position(3, 15_000), position(8, 12_000, { deviceId: 999 }),
    position(9, 10_000, { latitude: null }), position(10, 5_000, { valid: false }),
    position(11, 3_000, { protocol: "other" })];
  let failure = false;
  const api = createTraccarClient({ token: "simulated", fetchImpl: async (url) => {
    if (url.pathname === "/api/devices") return Response.json([device]);
    assert.equal(url.searchParams.get("deviceId"), "42");
    assert.ok(url.searchParams.get("from"));
    if (failure) throw new Error("simulated outage");
    return Response.json(rows);
  } });
  assert.deepEqual(await syncPositions({ api, store, mappings: [mapping], now }), { inserted: 1, rejected: 4 });
  assert.equal(store.latest(mapping, now).status, "LIVE");
  failure = true;
  await assert.rejects(syncPositions({ api, store, mappings: [mapping], now }), /request failed/);
  store.close();

  store = openPositionStore(dbFile);
  t.after(() => store.close());
  failure = false;
  rows = [position(2, 120_000), position(3, 15_000), position(6, 15_000)];
  assert.deepEqual(await syncPositions({ api, store, mappings: [mapping], now }), { inserted: 1, rejected: 0 });
  assert.equal(store.latest(mapping, now).fixTime, position(3, 15_000).fixTime);
  assert.equal(store.latest(mapping, now + 100_000).status, "STALE");
  assert.equal(store.latest(mapping, now + 400_000).status, "OFFLINE");
  assert.deepEqual(await syncPositions({ api, store, mappings: [mapping], now }), { inserted: 0, rejected: 0 });
});

test("missing or ambiguous registrations fail closed", async () => {
  const store = openPositionStore(":memory:");
  try {
    const api = { devices: async () => [device, { ...device, id: 7 }] };
    await assert.rejects(syncPositions({ api, store, mappings: [mapping], now }), /registration/i);
    assert.equal(store.latest(mapping, now).status, "OFFLINE");
  } finally {
    store.close();
  }
});

test("registration recovers a lost response without a second write", async () => {
  const devices = [];
  let requests = 0;
  const operator = {
    devices: async () => devices,
    register: async () => {
      requests++;
      devices.push(device);
      throw new Error("response lost after commit");
    },
  };
  assert.deepEqual(await ensureRegistered(operator, mapping), device);
  assert.equal(requests, 1);
});

test("offsets normalize to UTC, impossible dates are rejected and skew cannot mark a truck LIVE", async () => {
  const store = openPositionStore(":memory:");
  try {
    const rows = [
      position(1, 1000, { fixTime: "2026-11-20T14:59:59+0300" }),
      position(2, 1000, { fixTime: "2026-11-31T12:00:00Z" }),
      position(3, -1000),
    ];
    const api = { devices: async () => [device], history: async () => rows };
    assert.deepEqual(await syncPositions({ api, store, mappings: [mapping], now }), { inserted: 2, rejected: 1 });
    assert.equal(store.latest(mapping, now).fixTime, "2026-11-20T11:59:59.000Z");
  } finally {
    store.close();
  }
});

test("credential verification requires exactly the approved devices and a readable history", async () => {
  const { verifyReadAccess } = await import("./qa-client.mjs");
  const queried = [];
  const api = {
    devices: async () => [device],
    history: async (id) => {
      queried.push(id);
      return [];
    },
  };
  assert.equal(await verifyReadAccess(api, [mapping], now), 1);
  assert.deepEqual(queried, [device.id]);
  api.devices = async () => [device, { id: 99, uniqueId: "unexpected" }];
  await assert.rejects(verifyReadAccess(api, [mapping], now), /device scope/);
  api.devices = async () => [device];
  api.history = async () => { throw new Error("Traccar API HTTP 403"); };
  await assert.rejects(verifyReadAccess(api, [mapping], now), /403/);
});

test("credential verification rejects a history response containing another device", async () => {
  const { verifyReadAccess } = await import("./qa-client.mjs");
  const api = { devices: async () => [device], history: async () => [position(1, 1000, { deviceId: 99 })] };
  await assert.rejects(verifyReadAccess(api, [mapping], now), /history scope/);
});

test("C32 can be registered but cannot ingest until its protocol is verified", async () => {
  const c32 = { uniqueId: "synthetic-c32", truckId: "qa-c32", name: "QA C32",
    model: "secumore-c32", plateNumber: "qa-32" };
  const registered = { id: 43, uniqueId: c32.uniqueId, name: c32.name };
  const devices = [];
  const api = {
    devices: async () => devices,
    register: async () => devices.push(registered),
    history: async () => assert.fail("C32 history must not feed ingestion"),
  };
  assert.equal(validateMappings([c32])[0].plateNumber, "QA-32");
  assert.throws(() => validateMappings([c32, { ...mapping, plateNumber: "QA-32" }]), /Duplicate QA truck plate/);
  assert.throws(() => validateMappings([{ ...c32, model: "gt06" }]), /Unknown/);
  assert.equal(await ensureRegistered(api, c32), registered);
  assert.equal(await ensureRegistered(api, c32), registered);
  assert.equal(devices.length, 1);
  assert.deepEqual(await syncPositions({ api, mappings: [c32], now,
    store: { commit: () => assert.fail("C32 must not reach the store") },
  }), { inserted: 0, rejected: 0 });
});

test("confirmed GT06 and existing H02 use separate mappings and deduplicate replay", async () => {
  const c32 = { uniqueId: "synthetic-c32", truckId: "qa-c32", name: "QA C32",
    model: "secumore-c32", plateNumber: "QA-32", verifiedProtocol: "gt06" };
  const registered = { id: 43, uniqueId: c32.uniqueId, name: c32.name };
  const api = {
    devices: async () => [device, registered],
    history: async (id) => id === device.id ? [position(1, 1000)] : [
      position(2, 1000, { deviceId: id, protocol: "gt06" }),
      position(3, 1000, { deviceId: id, protocol: "h02" }),
      position(4, 1000, { deviceId: device.id, protocol: "gt06" }),
    ],
  };
  const store = openPositionStore(":memory:");
  try {
    const sync = () => syncPositions({ api, store, mappings: [mapping, c32], now });
    assert.deepEqual(await sync(), { inserted: 2, rejected: 2 });
    assert.deepEqual(await sync(), { inserted: 0, rejected: 2 });
    assert.equal(store.latest(c32, now).status, "LIVE");
  } finally {
    store.close();
  }
});
