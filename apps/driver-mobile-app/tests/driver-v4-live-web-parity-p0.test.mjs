import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const auth = read("src/auth.tsx");
const i18n = read("src/driver/driver-v4-i18n.ts");
const profileService = read("src/driver/driver-profile.service.ts");
const profileView = read("src/driver/DriverProfileView.tsx");
const trip = read("src/driver/DriverActiveTripView.tsx");
const map = read("src/driver/DriverActiveTripMap.tsx");
const commissionPanel = read("src/driver/DriverCommissionPaymentPanel.tsx");

test("Driver login exposes Google Password Manager compatible autofill semantics", () => {
  assert.match(auth, /autoComplete=\{signup \|\| reset \? "email" : "username"\}/);
  assert.match(auth, /autoComplete=\{signup \? "new-password" : "current-password"\}/);
});

test("Driver V4 visible copy has no UTF-8 mojibake markers", () => {
  assert.doesNotMatch(i18n, /(?:Â|â€¦|â†|â€”|ðŸ|âœ|ï¿½|�)/u);
  assert.doesNotMatch(auth, /(?:Â|â€¦|â†|â€”|ðŸ|âœ|ï¿½|�)/u);
});

test("Driver profile can save signed-in contact and home-address fields", () => {
  assert.match(profileService, /export async function saveDriverContactProfile/);
  assert.match(profileService, /\.update\(\{[\s\S]*full_name:[\s\S]*phone:[\s\S]*email:[\s\S]*home_address:/);
  assert.match(profileView, /data-driver-profile-contact-editor/);
  assert.match(profileView, /saveDriverContactProfile/);
});

test("Active Trip exposes portal-equivalent dynamic finance breakdown", () => {
  assert.match(trip, /data-driver-trip-finance/);
  assert.match(trip, /platformCommission/);
  assert.match(trip, /driverNet/);
  assert.match(trip, /trip\.priceEtb/);
  assert.match(trip, /0\.02/);
  assert.match(trip, /grossFare/);
  assert.match(trip, /expectedNet/);
});

test("Active Trip uses localized share text with live GPS coordinates and trip id", () => {
  assert.match(trip, /t\.trip\.shareTitle/);
  assert.match(trip, /t\.trip\.shareText/);
  assert.match(trip, /google\.com\/maps\?q=/);
  assert.match(trip, /trip\?\.trackingId/);
  assert.match(trip, /navigator\.share/);
});

test("Driver live map contains route, endpoints and current-driver marker", () => {
  assert.match(map, /data-driver-real-map/);
  assert.match(map, /driver-route/);
  assert.match(map, /driverPosition/);
  assert.match(map, /start/);
  assert.match(map, /end/);
  assert.match(trip, /<DriverActiveTripMap/);
});

test("Commission settlement keeps provider, amount, reference, receipt and history contracts", () => {
  assert.match(commissionPanel, /provider/);
  assert.match(commissionPanel, /amount/);
  assert.match(commissionPanel, /transactionId/);
  assert.match(commissionPanel, /receipt/);
  assert.match(commissionPanel, /acceptedPaymentEvidenceTypes/);
  assert.match(commissionPanel, /history/);
  assert.match(commissionPanel, /pending/i);
  assert.match(commissionPanel, /approved/i);
});

test("Driver V4 finance and visible labels do not expose replacement question-mark artifacts", () => {
  assert.doesNotMatch(trip, />\? \{Math\.round\(platformCommission\)/);
  assert.doesNotMatch(i18n, /Refreshing\?|Loading\?|Open Active Trip \?|Call \?|STATUS \?|Seen \?\?|Sent \?|\?\? Camera|\?\? Gallery/);
  assert.doesNotMatch(i18n, /olkaa\?aa|\?\?\?\? \?\?\?\?\?\? \?\?\?/);
});

test("Driver V4 localized copy has no lost separator or Oromo apostrophe placeholders", () => {
  assert.doesNotMatch(i18n, / \? /);
  assert.doesNotMatch(i18n, /olkaa\?(?:i|ameera|uun|aa)/);
});
