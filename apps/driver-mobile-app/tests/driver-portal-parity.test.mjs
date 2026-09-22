import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relative) => readFileSync(path.join(root, relative), "utf8");

const workspace = source("src/DriverWorkspace.tsx");
const home = source("src/driver/DriverHomeView.tsx");
const jobs = source("src/driver/DriverJobsBoard.tsx");
const workboardService = source("src/driver/driver-jobs.service.ts");
const trip = source("src/driver/DriverActiveTripView.tsx");
const wallet = source("src/driver/DriverWalletView.tsx");
const paymentService = source("src/driver/driver-trip-payment.service.ts");
const chatService = source("src/driver/driver-chat.service.ts");
const css = source("src/driver-v4.css");
const i18n = source("src/driver/driver-v4-i18n.ts");

test("Driver V4 keeps five portal primary destinations and header utilities", () => {
  assert.match(workspace, /grid-cols-5/);
  for (const tab of ["home", "jobs", "trip", "wallet", "profile"]) {
    assert.match(workspace, new RegExp(`id: "${tab}"`));
  }
  assert.match(workspace, /DriverOperationsChatLauncher/);
  assert.match(workspace, /setTab\("alerts"\)/);
});

test("Driver V4 home uses real authenticated Driver sources", () => {
  for (const call of [
    "fetchDriverProfile",
    "fetchDriverTrucks",
    "fetchDriverVerificationFiles",
    "fetchDriverWorkboard",
    "fetchDriverFinancialSummary",
    "fetchDriverCommissionSummary",
  ]) assert.match(home, new RegExp(call));
});

test("jobs parity includes GPS availability and assigned cancellation", () => {
  assert.match(jobs, /DriverAvailabilityCard/);
  assert.match(jobs, /data-driver-cancellation-notice/);
  assert.match(workboardService, /cancellation_reason,cancelled_at/);
  assert.match(workboardService, /driver_id/);
});

test("trip keeps customer payment workflow while wallet payment actions stay read-only", () => {
  assert.match(trip, /DriverTripCustomerPaymentPanel/);
  assert.doesNotMatch(wallet, /DriverPendingPaymentActions/);
  assert.doesNotMatch(wallet, /DriverCommissionPaymentPanel/);
  for (const rpc of [
    "driver_order_contact",
    "driver_payment_status",
    "driver_confirm_verified_payment",
    "driver_report_payment_not_received",
  ]) assert.match(paymentService, new RegExp(rpc));
  assert.doesNotMatch(paymentService, /payment-receipts|receipt_path|type="file"/i);
});

test("operations chat reuses guarded portal RPC and realtime contracts", () => {
  for (const rpc of [
    "driver_get_or_create_chat_thread",
    "send_driver_chat_message",
    "mark_driver_chat_read",
    "my_driver_chat_unread_count",
  ]) assert.match(chatService, new RegExp(rpc));
  assert.match(chatService, /driver_chat_messages/);
  assert.match(chatService, /driver_chat_threads/);
});

test("V4 CSS remains the design base and adds responsive parity selectors", () => {
  assert.match(css, /HALLO Driver Mobile App V4/);
  for (const selector of [
    "data-driver-v4-workspace",
    "data-driver-availability",
    "data-driver-pending-payments",
    "data-driver-operations-chat",
  ]) assert.match(css, new RegExp(selector));
  for (const width of ["430px", "412px", "390px", "360px", "320px"]) assert.match(css, new RegExp(width.replace("px", "\\px")));
});

test("Driver V4 authenticated UX exposes language, scroll, location sharing and trip history", () => {
  const androidCss = source("src/driver-android-responsive.css");
  assert.match(workspace, /DRIVER_LANGUAGE_KEY/);
  assert.match(i18n, /hallo-driver-language/);
  assert.match(workspace, /<option value="en">EN<\/option>/);
  assert.match(workspace, /<option value="om">OR<\/option>/);
  assert.match(workspace, /<option value="am">አማ<\/option>/);
  assert.match(workspace, /className="driver-app/);
  assert.match(androidCss, /\[data-driver-v4-workspace\]\.driver-app/);
  assert.match(androidCss, /overflow-y:\s*auto/);
  assert.match(trip, /data-driver-live-location/);
  assert.match(trip, /navigator\.share/);
  assert.match(trip, /navigator\.clipboard\.writeText/);
  assert.match(home, /t\.home\.history/);
  assert.match(i18n, /Trip History \/ Wallet/);
  assert.match(wallet, /fetchDriverWalletTrips/);
});
