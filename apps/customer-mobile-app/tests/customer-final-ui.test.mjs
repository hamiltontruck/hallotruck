import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const booking = readFileSync(new URL("../src/CustomerBookingJourney.tsx", import.meta.url), "utf8");
const appNav = app;
const home = readFileSync(new URL("../src/CustomerHomePage.tsx", import.meta.url), "utf8");
const dataService = readFileSync(new URL("../src/customer-data.service.ts", import.meta.url), "utf8");
const details = readFileSync(new URL("../src/CustomerOrderDetailsPage.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../src/CustomerOrdersV4Page.tsx", import.meta.url), "utf8");
const utilities = readFileSync(new URL("../src/CustomerUtilityPages.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../src/customer-final-copy.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/customer-final-ui.css", import.meta.url), "utf8");
const androidCss = readFileSync(new URL("../src/customer-android-responsive.css", import.meta.url), "utf8");
const trackingPage = readFileSync(new URL("../src/CustomerTrackingPage.tsx", import.meta.url), "utf8");
const trackingMap = readFileSync(new URL("../src/CustomerTrackingMap.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

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
  assert.match(booking, /const truckFitsCargo = cargoTons <= 0 \|\| cargoTons <= truck\.capacityTons/);
  assert.match(booking, /const fits = cargoTons <= 0 \|\| cargoTons <= option\.capacityTons/);
  assert.match(booking, /disabled=\{!truckReady\}/);
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
  assert.match(auth, /09XXXXXXXX \/ 07XXXXXXXX \/ \+2519XXXXXXXX \/ \+2517XXXXXXXX/);
  assert.match(auth, /normalizeEthiopianMobile/);
  assert.match(auth, /sanitizeEthiopianPhoneInput/);
  assert.match(auth, /maxLength=\{13\}/);
  assert.match(auth, /passwordVisible/);
  assert.match(auth, /termsAccepted/);
  assert.match(auth, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
});

test("Android WebView shell follows the visual viewport, safe areas and keyboard", () => {
  assert.match(main, /visualViewport/);
  assert.match(main, /--customer-app-height/);
  assert.match(main, /customer-android-responsive\.css/);
  assert.match(androidCss, /height: var\(--customer-app-height\)/);
  assert.match(androidCss, /env\(safe-area-inset-top\)/);
  assert.match(androidCss, /env\(safe-area-inset-right\)/);
  assert.match(androidCss, /env\(safe-area-inset-bottom\)/);
  assert.match(androidCss, /env\(safe-area-inset-left\)/);
  assert.match(androidCss, /\.customer-entry:focus-within \.customer-entry-footer/);
  assert.match(androidCss, /@media \(max-width: 339px\)/);
  assert.match(androidCss, /@media \(min-width: 340px\) and \(max-width: 359px\)/);
  assert.match(androidCss, /@media \(min-width: 390px\)/);
  assert.match(androidCss, /@media \(min-width: 412px\)/);
});

test("smart mobile layouts keep Orders compact and Tracking immersive", () => {
  assert.match(orders, /expanded=\{expanded\[order\.id\] \?\? false\}/);
  assert.match(orders, /customer-v4-actions__track/);
  assert.match(orders, /customer-v4-details[\s\S]*CustomerAssignmentCard/);
  assert.match(app, /!bookingOpen && page !== "track" && <BottomNav/);
  assert.match(androidCss, /\.customer-track-full-map \.customer-track-v4__map/);
  assert.match(androidCss, /height: clamp\(360px, 58dvh, 520px\)/);
  assert.match(androidCss, /customer-v4-order-card \.customer-v4-assignment__body[\s\S]*grid-template-columns: repeat\(2/);
  assert.doesNotMatch(trackingPage, /<TrackingHeader right=\{labelStatus\(order\.status\)\}/);
  assert.doesNotMatch(trackingPage, />Refresh tracking<\/button>/);
  assert.match(trackingMap, /Truck as TruckIcon/);
  assert.match(trackingMap, /try \{[\s\S]*new maplibregl\.Map/);
  assert.match(trackingMap, /Interactive map unavailable on this device/);
});

test("booking route uses the live visual viewport and keyboard-first map layout", () => {
  assert.match(androidCss, /height: calc\(var\(--customer-app-height\) - 126px/);
  assert.match(androidCss, /\.customer-final-route-step \.map-surface[\s\S]*height: 100%/);
  assert.match(androidCss, /:has\(\.booking-place-field input:focus\) \.real-start-sheet/);
  assert.match(androidCss, /\.real-start-sheet[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(androidCss, /\.real-start-sheet button[\s\S]*min-height: 44px/);
});


test("truck picker keeps every truck active, scrollable and resets selection on return", () => {
  assert.doesNotMatch(booking, /disabled=\{!fits\}/);
  assert.match(booking, /resetTruckSelection/);
  assert.match(booking, /truckListRef\.current\?\.scrollTo/);
  assert.match(css, /customer-final-truck-list[\s\S]*overflow-y:auto/);
  assert.doesNotMatch(css, /customer-final-truck-row:disabled\{opacity:/);
});

test("booking exposes a future service date through review and customer order reads", () => {
  assert.match(booking, /type="date"/);
  assert.match(booking, /serviceDate/);
  assert.match(booking, /serviceDate,/);
  assert.match(booking, /disabled=\{!selectedTruck\}/);
});


test("center booking navigation uses a white truck with forward arrow", () => {
  assert.match(appNav, /customer-final-nav-truck/);
  assert.match(appNav, /customer-final-nav-arrow/);
});


test("service date is loaded and shown on customer order surfaces", () => {
  assert.match(dataService, /service_date: string \| null/);
  assert.match(dataService, /cargo_description,service_date,created_at/);
  assert.match(orders, /order\.service_date/);
  assert.match(details, /order\.service_date/);
  assert.match(copy, /orderDate:/);
});
