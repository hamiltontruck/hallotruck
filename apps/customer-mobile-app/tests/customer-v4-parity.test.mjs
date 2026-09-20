import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assignmentService = readFileSync(new URL("../src/customer-assignment.service.ts", import.meta.url), "utf8");
const assignmentCard = readFileSync(new URL("../src/CustomerAssignmentCard.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../src/CustomerOrdersV4Page.tsx", import.meta.url), "utf8");
const ordersRealtime = readFileSync(new URL("../src/customer-orders-realtime.service.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/CustomerProfileV4Page.tsx", import.meta.url), "utf8");
const profileService = readFileSync(new URL("../src/customer-profile.service.ts", import.meta.url), "utf8");
const avatarService = readFileSync(new URL("../src/customer-profile-avatar.service.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/customer-v4-parity.css", import.meta.url), "utf8");
const cancelStyles = readFileSync(new URL("../src/customer-v4-cancel.css", import.meta.url), "utf8");
const avatarStyles = readFileSync(new URL("../src/customer-profile-avatar.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

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

test("Orders matches portal cancellation boundary and cancellation sheet", () => {
  assert.match(orders, /CUSTOMER_CANCELLABLE_STATUSES = new Set\(\["quoted", "placed"\]\)/);
  assert.doesNotMatch(orders, /window\.prompt/);
  assert.match(orders, /Cancel this transport order\?/);
  assert.match(orders, /Cancellation reason/);
  assert.match(orders, /maxLength=\{500\}/);
  assert.match(orders, /Cancel order with reason/);
  assert.match(orders, /CustomerAssignmentCard/);
  assert.match(orders, /onTrackOrder\(order\.id\)/);
  assert.match(orders, /Invoice \/ receipt PDF/);
  assert.match(orders, /View details/);
  assert.match(main, /customer-v4-cancel\.css/);
});

test("Orders realtime is Customer-filtered, lifecycle-safe and reloads assignment/status changes", () => {
  assert.match(orders, /subscribeCustomerOrderChanges\(userId/);
  assert.match(ordersRealtime, /auth\.user\.id !== userId/);
  assert.match(ordersRealtime, /table: "orders"/);
  assert.match(ordersRealtime, /filter: `customer_id=eq\.\$\{userId\}`/);
  assert.match(ordersRealtime, /event: "\*"/);
  assert.match(ordersRealtime, /removeChannel\(channel\)/);
  assert.doesNotMatch(ordersRealtime, /service_role|user_metadata/i);
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

test("Customer avatar uses the existing private v2 profile and own-UID storage contract", () => {
  assert.match(avatarService, /rpc\("customer_get_profile_v2"\)/);
  assert.match(avatarService, /CUSTOMER_AVATAR_BUCKET = "customer-avatars"/);
  assert.match(avatarService, /return `\$\{userId\}\/avatar\.jpg`/);
  assert.match(avatarService, /avatarPath\.trim\(\) !== expectedPath/);
  assert.match(avatarService, /createSignedUrl\(expectedPath, CUSTOMER_AVATAR_TTL_SECONDS\)/);
  assert.match(avatarService, /\.upload\(path, blob, \{ upsert: true, contentType: "image\/jpeg"/);
  assert.match(avatarService, /rpc\("customer_set_avatar", \{ p_avatar_path: path \}\)/);
  assert.match(avatarService, /rpc\("customer_clear_avatar"\)/);
  assert.match(avatarService, /CUSTOMER_AVATAR_MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(avatarService, /image\/jpeg/);
  assert.match(avatarService, /image\/png/);
  assert.match(avatarService, /image\/webp/);
  assert.match(avatarService, /canvas\.toBlob/);
  assert.doesNotMatch(avatarService, /\.from\("profiles"\)|service_role|user_metadata/i);
});

test("Customer avatar UI provides camera, gallery, progress, retry, persistence and safe fallback", () => {
  assert.match(profile, /loadCustomerMobileAvatarProfile\(userId\)/);
  assert.match(profile, /createCustomerAvatarUrl\(userId, nextProfile\.avatar_path\)/);
  assert.match(profile, /capture="user"/);
  assert.match(profile, /Photo library/);
  assert.match(profile, /uploadCustomerAvatar\(userId, file/);
  assert.match(profile, /avatarProgress/);
  assert.match(profile, /Retry photo upload/);
  assert.match(profile, /Customer avatar fallback/);
  assert.match(profile, /onImageError/);
  assert.match(main, /customer-profile-avatar\.css/);
});

test("V4 layouts stay narrow-phone safe and keep touch targets", () => {
  const combinedStyles = `${styles}\n${cancelStyles}\n${avatarStyles}`;
  assert.match(combinedStyles, /min-height:44px/);
  assert.match(combinedStyles, /max-width:100%/);
  assert.match(combinedStyles, /overflow-x:clip/);
  assert.match(combinedStyles, /@media\s*\(max-width:\s*360px\)/);
  assert.match(combinedStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(cancelStyles, /100dvh/);
  assert.match(avatarStyles, /object-fit:cover/);
  assert.match(avatarStyles, /flex-wrap:wrap/);
  assert.doesNotMatch(combinedStyles, /(?:^|[;{])\s*min-width:\s*(3[2-9][0-9]|[4-9][0-9]{2})px/);
});
