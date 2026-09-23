import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");
const workspace = read("src/DriverWorkspace.tsx");
const trip = read("src/driver/DriverActiveTripView.tsx");
const jobs = read("src/driver/DriverJobsBoard.tsx");
const wallet = read("src/driver/DriverWalletView.tsx");
const profile = read("src/driver/DriverProfileView.tsx");
const profileModel = read("src/driver/driver-profile.model.ts");
const delivery = read("src/driver/DriverDeliveryProofPanel.tsx");
const payment = read("src/driver/DriverTripCustomerPaymentPanel.tsx");
const notifications = read("src/driver/DriverNotificationsView.tsx");
const chat = read("src/driver/DriverOperationsChatLauncher.tsx");
const availability = read("src/driver/DriverAvailabilityCard.tsx");
const css = read("src/driver-v4.css");
const androidCss = read("src/driver-android-responsive.css");
const i18nUrl = new URL("../src/driver/driver-v4-i18n.ts", import.meta.url);
const i18n = existsSync(i18nUrl) ? readFileSync(i18nUrl, "utf8") : "";

test("Active Trip keeps every hook before conditional render exits", () => {
  const shareHook = trip.indexOf("const shareLocation = useCallback");
  const firstConditionalExit = trip.indexOf("if (loading && !confirmedSnapshot)");
  assert.ok(shareHook >= 0, "Share Location callback hook must exist");
  assert.ok(firstConditionalExit >= 0, "loading guard must exist");
  assert.ok(shareHook < firstConditionalExit, "shareLocation hook must run before loading/null early returns");
});

test("Home, Jobs and Trip navigation converge on one stable DriverActiveTripView", () => {
  assert.match(workspace, /onOpenTrip=\{\(\) => setTab\("trip"\)\}/);
  assert.match(workspace, /tab === "trip"[\s\S]*<DriverActiveTripView/);
  assert.match(workspace, /onClick=\{\(\) => setTab\(item\.id\)\}/);
});

test("authenticated workspace contains a visible child render error boundary", () => {
  assert.match(workspace, /DriverWorkspaceErrorBoundary/);
  assert.match(workspace, /data-driver-v4-error-boundary/);
  assert.match(workspace, /onRecover/);
});

test("Driver V4 uses one typed authenticated EN OR AM copy layer", () => {
  assert.ok(i18n.length > 0, "driver-v4-i18n.ts must exist");
  assert.match(i18n, /export type DriverLanguage = "om" \| "en" \| "am"/);
  assert.match(i18n, /export const DRIVER_LANGUAGE_KEY = "hallo-driver-language"/);
  assert.match(i18n, /export const driverV4Copy/);
  for (const lang of ["en", "om", "am"]) assert.match(i18n, new RegExp(`const ${lang} =`));
  assert.match(i18n, /driverV4Copy = \{ en, om, am \}/);
  assert.match(workspace, /DRIVER_LANGUAGE_KEY/);
});

test("language is passed through every authenticated Driver V4 utility and workflow", () => {
  for (const pattern of [
    /<DriverActiveTripView[\s\S]*language=\{language\}/,
    /<DriverJobsBoard[\s\S]*language=\{language\}/,
    /<DriverWalletView[\s\S]*language=\{language\}/,
    /<DriverProfileView[\s\S]*language=\{language\}/,
    /<DriverNotificationsView[\s\S]*language=\{language\}/,
    /<DriverOperationsChatLauncher[\s\S]*language=\{language\}/,
  ]) assert.match(workspace, pattern);
  assert.match(trip, /<DriverTripCustomerPaymentPanel[\s\S]*language=\{language\}/);
  assert.match(trip, /<DriverDeliveryProofPanel[\s\S]*language=\{language\}/);
  assert.match(jobs, /<DriverAvailabilityCard[\s\S]*language=\{language\}/);
});

test("English profile cannot inherit the Oromo missing-value fallback", () => {
  assert.doesNotMatch(profileModel, /return "Hin galmoofne"/);
  assert.match(profile, /copy\.missing|t\.profile\.missing|p\.missing/);
});

test("major authenticated surfaces consume centralized copy rather than screen-local language ternaries", () => {
  for (const [name, source] of [
    ["workspace", workspace],
    ["trip", trip],
    ["jobs", jobs],
    ["wallet", wallet],
    ["delivery", delivery],
    ["payment", payment],
    ["notifications", notifications],
    ["chat", chat],
    ["availability", availability],
  ]) {
    assert.match(source, /driverV4Copy|useDriverV4Copy|getDriverV4Copy/, name + " must use centralized Driver V4 copy");
  }
});

test("visible authenticated error paths do not surface raw service-language exception messages", () => {
  for (const [name, source] of [
    ["trip", trip],
    ["jobs", jobs],
    ["wallet", wallet],
    ["delivery", delivery],
    ["payment", payment],
    ["notifications", notifications],
    ["chat", chat],
    ["availability", availability],
  ]) {
    assert.doesNotMatch(source, /caught instanceof Error\s*\?\s*caught\.message|reason instanceof Error\s*\?\s*[^:]+\.message/, name + " must localize visible errors");
  }
});

test("Share Location retains Web Share and clipboard fallback", () => {
  assert.match(trip, /navigator\.share/);
  assert.match(trip, /navigator\.clipboard\.writeText/);
  assert.match(trip, /google\.com\/maps\?q=/);
});

test("wallet keeps portal-backed trip history and financial contracts", () => {
  assert.match(wallet, /fetchDriverWalletTrips/);
  assert.match(wallet, /fetchDriverFinancialSummary/);
  assert.match(wallet, /fetchDriverCommissionSummary/);
  assert.match(wallet, /DriverCommissionPaymentPanel/);
  assert.doesNotMatch(wallet, /DriverPendingPaymentActions/);
});

test("final Driver card is concise and profile includes customer trust rating", () => {
  assert.match(trip, /function concisePlace/);
  assert.match(trip, /\{fullName\}.*\{trip\.trackingId\}/);
  assert.match(trip, /concisePlace\(trip\.pickupAddress\).*concisePlace\(trip\.dropoffAddress\)/s);
  assert.match(profile, /ratingSummary|ratingAvg/);
});

test("authenticated shell remains scrollable with sticky five-tab navigation at target widths", () => {
  assert.match(workspace, /grid-cols-5/);
  assert.match(androidCss, /\[data-driver-v4-workspace\]\.driver-app[\s\S]*overflow-y:\s*auto/);
  assert.match(androidCss, /\[data-driver-v4-workspace\] > nav[\s\S]*position:\s*fixed[\s\S]*bottom:\s*0/);
  assert.match(androidCss, /padding-bottom:\s*calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(androidCss, /\[data-driver-v4-workspace\] > header select[\s\S]*font-size:\s*12px/);
  for (const width of ["320px", "360px", "390px", "412px", "430px"]) {
    assert.match(css + "\n" + androidCss, new RegExp(width.replace(".", "\\.")), "responsive CSS must cover " + width);
  }
});

test("scope lock keeps authenticated parity work out of login and auth selectors", () => {
  assert.doesNotMatch(css, /\.driver-auth|\.login|sign-in-form/);
});


test("notification payloads are localized and the current authenticated tab survives refresh", () => {
  assert.match(notifications, /localizeDriverNotification/);
  assert.match(notifications, /localized\.title/);
  assert.match(notifications, /localized\.body/);
  assert.doesNotMatch(notifications, /\{item\.title\}<\/strong>/);
  assert.match(i18n, /newDeliveryAssigned/);
  assert.match(i18n, /deliveryRecorded/);
  assert.match(workspace, /DRIVER_TAB_KEY/);
  assert.match(workspace, /localStorage\.getItem/);
  assert.match(workspace, /localStorage\.setItem/);
});

test("Amharic authenticated copy removes the visible English leftovers reported in smoke", () => {
  const start = i18n.indexOf("const am = {");
  const end = i18n.indexOf("export const driverV4Copy", start);
  const amBlock = i18n.slice(start, end);
  assert.doesNotMatch(amBlock, /"[^"]*\b(?:Customer|customer|CUSTOMER|Admin\/CEO|Provider|Receipt|Depart left)\b[^"]*"/);
});
