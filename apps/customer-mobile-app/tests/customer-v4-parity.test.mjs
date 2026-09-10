import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assignmentService = readFileSync(new URL("../src/customer-assignment.service.ts", import.meta.url), "utf8");
const assignmentCard = readFileSync(new URL("../src/CustomerAssignmentCard.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../src/CustomerOrdersV4Page.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/CustomerProfileV4Page.tsx", import.meta.url), "utf8");
const profileService = readFileSync(new URL("../src/customer-profile.service.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/customer-v4-parity.css", import.meta.url), "utf8");

test("Customer-owned assignment visibility is bounded by owned order ids", () => {
  assert.match(assignmentService, /rpc\("customer_driver_assignment_cards"\)/);
  assert.match(assignmentService, /allowedOrderIds = new Set\(orderIds\)/);
  assert.match(assignmentService, /filter\(\(assignment\) => allowedOrderIds\.has\(assignment\.order_id\)\)/);
  assert.match(assignmentService, /auth\.user\.id !== userId/);
  assert.doesNotMatch(assignmentService, /\.from\("profiles"\)/);
});

test("Driver and truck photos use the existing private assignment storage contract", () => {
  assert.match(assignmentService, /\.from\("driver-verification"\)[\s\S]*?\.createSignedUrl\(cleanPath, PHOTO_URL_TTL_SECONDS\)/);
  assert.match(assignmentCard, /assignment\.driver_verified \? assignment\.driver_photo_path/);
  assert.match(assignmentCard, /assignment\.truck_photo_path/);
  assert.match(assignmentCard, /onError=\{\(\) => setDriverPhotoUrl\(null\)\}/);
  assert.match(assignmentCard, /onError=\{\(\) => setTruckPhotoUrl\(null\)\}/);
  assert.match(assignmentCard, /Driver photo fallback/);
  assert.match(assignmentCard, /Truck photo unavailable/);
});

test("assignment card maps driver/truck data and provides a real call action", () => {
  for (const token of ["ASSIGNED DRIVER & TRUCK","driver_name","driver_phone","plate_number","vehicle_type","capacity_tons","VERIFIED DRIVER"]) assert.match(assignmentCard, new RegExp(token.replace(/[&]/g, "&amp;|&")));
  assert.match(assignmentCard, /href=\{`tel:\$\{phone\}`\}/);
  assert.match(assignmentCard, /Live trip tracking/);
});

test("Orders preserves portal cancellation boundary and exposes assignment tracking", () => {
  assert.match(orders, /CUSTOMER_CANCELLABLE_STATUSES = new Set\(\["quoted", "placed", "accepted", "in_transit"\]\)/);
  assert.match(orders, /CustomerAssignmentCard/);
  assert.match(orders, /onTrackOrder\(order\.id\)/);
  assert.match(orders, /Invoice \/ receipt PDF/);
  assert.match(orders, /View details/);
  assert.match(orders, /Cancel order/);
});

test("Customer profile edits only through existing secure profile RPC", () => {
  assert.match(profileService, /rpc\("customer_update_profile"/);
  assert.match(profileService, /auth\.user\.id !== userId/);
  assert.doesNotMatch(profileService, /\.from\("profiles"\)/);
  assert.doesNotMatch(profileService, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(profile, /Edit profile/);
  assert.match(profile, /Full name/);
  assert.match(profile, /Home address/);
  assert.match(profile, /Account type/);
  assert.match(profile, /Company/);
});

test("Customer avatar safely falls back because current profile backend has no photo persistence field", () => {
  assert.match(profile, /customerInitials/);
  assert.match(profile, /Customer avatar fallback/);
  assert.match(profile, /photo upload is not exposed by the current Customer profile RPC\/storage contract/);
  assert.doesNotMatch(profile + profileService, /storage\.from\(|upload\(/);
});

test("V4 layouts stay narrow-phone safe and keep touch targets", () => {
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /max-width:100%/);
  assert.match(styles, /overflow-x:clip/);
  assert.match(styles, /@media\(max-width:360px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(styles, /min-width:\s*(3[2-9][0-9]|[4-9][0-9]{2})px/);
});
