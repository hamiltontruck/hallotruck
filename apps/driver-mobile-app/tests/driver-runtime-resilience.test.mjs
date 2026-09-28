import assert from "node:assert/strict";
import test from "node:test";
import {
  driverRefreshCompletion,
  driverGpsBlockReason,
  nextDriverMapStyleAfterFailure,
  settleDriverSourcesWithin,
} from "../.test-dist-active/driver-runtime-resilience.js";
import { requireExpectedDriverSession } from "../.test-dist-active/driver-session.js";

test("a stale StrictMode request drains the queued remount refresh", () => {
  assert.deepEqual(driverRefreshCompletion({ mounted: true, requestId: 1, currentRequestId: 2, queued: true }), {
    accept: false,
    runQueued: true,
  });
});

test("parallel Driver sources share one authoritative session validation", async () => {
  let userCalls = 0;
  let sessionCalls = 0;
  const client = {
    auth: {
      getUser: async () => { userCalls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { data: { user: { id: "driver-1" } }, error: null }; },
      getSession: async () => { sessionCalls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { data: { session: { user: { id: "driver-1" } } }, error: null }; },
    },
  };
  await Promise.all([
    requireExpectedDriverSession(client, "driver-1", "Wallet"),
    requireExpectedDriverSession(client, "driver-1", "Wallet"),
    requireExpectedDriverSession(client, "driver-1", "Profile"),
  ]);
  assert.equal(userCalls, 1);
  assert.equal(sessionCalls, 1);
});

test("an unresponsive wallet or profile source is rejected instead of holding the whole screen spinner", async () => {
  const never = new Promise(() => undefined);
  const results = await settleDriverSourcesWithin([
    Promise.resolve("profile"),
    never,
  ], 10);

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.match(String(results[1].reason), /timed out/i);
});

test("a map failure advances to the next real style even after the first style loaded", () => {
  assert.equal(nextDriverMapStyleAfterFailure(0, 2), 1);
  assert.equal(nextDriverMapStyleAfterFailure(1, 2), null);
});

test("live GPS explains insecure LAN HTTP separately from missing geolocation support", () => {
  assert.equal(driverGpsBlockReason({ hasGeolocation: true, isSecureContext: false }), "insecure");
  assert.equal(driverGpsBlockReason({ hasGeolocation: false, isSecureContext: true }), "unsupported");
  assert.equal(driverGpsBlockReason({ hasGeolocation: true, isSecureContext: true }), null);
});
