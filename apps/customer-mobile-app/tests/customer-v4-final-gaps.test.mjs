import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const avatarService = readFileSync(new URL("../src/customer-profile-avatar.service.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/CustomerProfileV4Page.tsx", import.meta.url), "utf8");
const assignmentCard = readFileSync(new URL("../src/CustomerAssignmentCard.tsx", import.meta.url), "utf8");
const trackingMap = readFileSync(new URL("../src/CustomerTrackingMap.tsx", import.meta.url), "utf8");

test("avatar removal treats the existing clear RPC as authoritative and storage cleanup as best effort", () => {
  const clearBlock = avatarService.slice(avatarService.indexOf("export async function clearCustomerAvatar"));
  assert.match(clearBlock, /rpc\("customer_clear_avatar"\)/);
  assert.match(clearBlock, /\.remove\(\[path\]\)/);
  assert.match(clearBlock, /storageCleanupFailed: Boolean\(storageError\)/);
  assert.doesNotMatch(clearBlock, /storageError[\s\S]*throw new Error/);
});

test("profile does not invent a new password reset or password mutation flow", () => {
  assert.doesNotMatch(profile, /resetPasswordForEmail|PASSWORD_RECOVERY|updateUser\s*\(\s*\{\s*password/);
});

test("assignment card has truthful empty state and Customer-only privacy footer", () => {
  assert.match(assignmentCard, /ASSIGNMENT PENDING/);
  assert.match(assignmentCard, /Private assignment details are shown only for this signed-in Customer/);
  assert.match(assignmentCard, /No Driver or truck data is guessed/);
});

test("tracking map exposes explicit map loading and load error states", () => {
  assert.match(trackingMap, /const \[mapLoading, setMapLoading\] = useState\(true\)/);
  assert.match(trackingMap, /const \[mapError, setMapError\] = useState\(""\)/);
  assert.match(trackingMap, /role="status">Loading map…/);
  assert.match(trackingMap, /role="alert">Map unavailable:/);
});

test("tracking quantitative progress is only derived from live GPS route data", () => {
  assert.match(trackingMap, /const completedPercent = gpsLive && remainingKm != null && routeDistance > 0/);
  assert.match(trackingMap, /completedPercent != null && <div className="customer-track-v4__progress"/);
  assert.doesNotMatch(trackingMap, /step \* 28/);
});
