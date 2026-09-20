import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const booking = readFileSync(new URL("../src/CustomerBookingJourney.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/CustomerHomePage.tsx", import.meta.url), "utf8");
const details = readFileSync(new URL("../src/CustomerOrderDetailsPage.tsx", import.meta.url), "utf8");
const utilities = readFileSync(new URL("../src/CustomerUtilityPages.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../src/customer-final-copy.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/customer-final-ui.css", import.meta.url), "utf8");

test("final Customer journey exposes every approved screen group", () => {
  for (const token of [
    "CustomerHomePage",
    "CustomerBookingJourney",
    "CustomerOrdersPage",
    "CustomerOrderDetailsPage",
    "CustomerTrackingPage",
    "CustomerPaymentsPage",
    "CustomerProfilePage",
    "CustomerSavedLocationsPage",
    "CustomerHelpPage",
    "CustomerSettingsPage",
  ]) assert.match(app, new RegExp(token));
  assert.match(auth, /function Splash/);
  assert.match(auth, /function AuthForm/);
});

test("booking is a real Route Truck Cargo Quote Review Success state machine", () => {
  assert.match(booking, /type BookingStep = "route" \| "truck" \| "cargo" \| "quote" \| "review" \| "success"/);
  assert.match(booking, /<CustomerBookingMap/);
  assert.match(booking, /loadCustomerQuotePreview/);
  assert.match(booking, /createCustomerMobileOrder/);
  assert.match(booking, /setStep\("success"\)/);
  assert.match(booking, /expectedQuoteEtb: fresh\.total_quote_etb/);
  assert.doesNotMatch(booking, /Math\.random\(\).*quote|hardcoded quote/i);
});

test("home and order details are wired to real Customer-owned data services", () => {
  assert.match(home, /loadCustomerMobileData\(userId\)/);
  assert.match(details, /loadCustomerMobileData\(userId\)/);
  assert.match(details, /loadCustomerAssignments\(userId, \[order\.id\]\)/);
  assert.match(details, /printCustomerMobileInvoice\(order, payments\)/);
  assert.match(details, /tel:\$\{assignment\.driver_phone\}/);
});

test("saved locations stays truthful to the existing profile contract", () => {
  assert.match(utilities, /loadCustomerMobileData\(userId\)/);
  assert.match(utilities, /profile\?\.home_address/);
  assert.match(utilities, /noFakeData/);
  assert.doesNotMatch(utilities, /localStorage.*location|mock.*location|Addis Ababa.*Adama Industrial/i);
});

test("EN OR Amharic final copy covers booking orders support settings and errors", () => {
  for (const language of ["en:", "om:", "am:"]) assert.match(copy, new RegExp(language));
  for (const key of [
    "bookTruck","trackOrder","cargoTitle","chooseTruck","yourQuote","reviewBooking",
    "bookingConfirmed","orderDetails","liveTracking","savedTitle","helpTitle","settingsTitle",
    "loading","retry","termsRequired","quoteChanged",
  ]) assert.match(copy, new RegExp(`\\b${key}:`));
});

test("final responsive CSS explicitly protects all required width classes and safe areas", () => {
  assert.match(css, /@media\(max-width:359px\)/);
  assert.match(css, /@media\(min-width:360px\) and \(max-width:389px\)/);
  assert.match(css, /@media\(min-width:390px\)/);
  assert.match(css, /@media\(min-width:412px\)/);
  assert.match(css, /@media\(min-width:430px\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:clip/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /font-size:16px/);
  assert.doesNotMatch(css, /nth-child\([^)]*\).*customer-auth|\[style\*=/);
});

test("auth includes Ethiopian phone formats, password visibility, terms and keyboard focus recovery", () => {
  assert.match(auth, /\+2519XXXXXXXX or 09XXXXXXXX/);
  assert.match(auth, /\^09\\d\{8\}\$/);
  assert.match(auth, /\^\\\+2519\\d\{8\}\$/);
  assert.match(auth, /passwordVisible/);
  assert.match(auth, /termsAccepted/);
  assert.match(auth, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
});
