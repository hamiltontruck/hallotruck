import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const analytics = read("src/services/analytics.ts");
const auth = read("src/auth/CustomerAuthBoundaryV2.tsx");
const booking = read("src/CustomerBookingJourney.tsx");
const orders = read("src/CustomerOrdersV4Page.tsx");
const app = read("src/App.tsx");

test("active authentication flow records only controlled success/failure outcomes", () => {
  assert.match(auth, /captureAnalyticsEvent\("login_succeeded",\s*\{\s*outcome:\s*"success",\s*source:\s*"email_login"/);
  assert.match(auth, /captureAnalyticsEvent\("login_failed",\s*\{\s*outcome:\s*"failed",\s*source:\s*"email_login",\s*reason_code:\s*"login_unavailable"/);
  assert.doesNotMatch(auth, /captureAnalyticsEvent\([^;\n]*(?:email\s*,|password\s*,|phone\s*,|error\.message)/);
});

test("quotes and orders are recorded only after successful server results", () => {
  assert.match(booking, /const result = await loadCustomerQuotePreview[\s\S]*setQuote\(result\);\s*captureAnalyticsEvent\("quote_created"/);
  assert.match(booking, /const order = await createCustomerMobileOrder[\s\S]*setCreatedOrder\(order\);\s*captureAnalyticsEvent\("order_placed"/);
  assert.doesNotMatch(booking, /captureAnalyticsEvent\([^;\n]*(?:order\.id|quote\.total_quote_etb|cargoNotes|pickupAddress|dropoffAddress|rawAmount)/);
});

test("cancel event follows a confirmed server cancellation without reason or IDs", () => {
  assert.match(orders, /await cancelCustomerMobileOrder\(userId,\s*order\.id,\s*cleanCancelReason\);\s*captureAnalyticsEvent\("order_cancelled"/);
  assert.doesNotMatch(orders, /captureAnalyticsEvent\([^;\n]*(?:cleanCancelReason|order\.id|userId)/);
});

test("internal SPA navigation uses allowlisted static routes, not raw location", () => {
  assert.match(app, /useEffect\(\(\) => \{\s*const view = bookingOpen \? "book" : page;/);
  assert.match(app, /captureAnalyticsVirtualPageview\("\/" \+ view\)/);
  assert.match(analytics, /safeCustomerAnalyticsRoute\("#" \+ pageRoute,\s*window\.location\.pathname\)/);
  assert.doesNotMatch(app, /captureAnalyticsVirtualPageview\([^;\n]*(?:orderId|trackingOrderId|location\.)/);
});

test("route failure event uses controlled code and never the caught error text", () => {
  assert.match(app, /captureAnalyticsEvent\("route_not_found",\s*\{\s*outcome:\s*"failed",\s*workflow:\s*"customer_booking",\s*reason_code:\s*"route_preview_unavailable"/);
  assert.doesNotMatch(app, /captureAnalyticsEvent\([^;\n]*error\.message/);
});
