import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const app = source("src/App.tsx");
const profilePage = source("src/pages/CustomerProfilePage.tsx");
const profilePanel = source("src/components/customer/CustomerProfilePanel.tsx");
const locationControl = source("src/components/customer/CustomerLocationControl.tsx");
const profileService = source("src/services/customer-profile.service.ts");
const sectionsCss = source("src/styles/customer-portal-sections.css");
const profilePaymentsSmoke = source("scripts/customer-profile-payments-e2e-smoke.mjs");

test("customer profile route uses a dedicated account workspace without loading the order portal", () => {
  assert.match(app, /import \{ CustomerProfilePage \} from "\.\/pages\/CustomerProfilePage"/);
  assert.match(app, /section === "profile"\) return .*<CustomerProfilePage \/>/);
  assert.match(profilePage, /getCustomerProfile/);
  assert.doesNotMatch(profilePage, /getCustomerPortalData/);
  assert.match(profileService, /supabase\.rpc\("customer_get_profile"\)/);
  assert.match(profilePage, /<CustomerBottomNav \/>/);
  assert.match(profilePage, /Secure account session/);
});

test("device location is explicit customer consent and never an automatic hidden profile side effect", () => {
  assert.doesNotMatch(profilePanel, /navigator\.geolocation/);
  assert.doesNotMatch(profilePanel, /getCurrentPosition/);
  assert.match(locationControl, /function requestLocation\(\)/);
  assert.match(locationControl, /onClick=\{requestLocation\}/);
  assert.match(locationControl, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(locationControl, /sessionStorage\.setItem\(CUSTOMER_LOCATION_KEY/);
  assert.match(locationControl, /sessionStorage\.removeItem\(CUSTOMER_LOCATION_KEY/);
  assert.match(locationControl, /not written to your customer profile/);
});

test("orders and payments expose different purpose-built customer actions", () => {
  assert.match(app, /CustomerSectionIntro section=\{section\}/);
  assert.match(app, /section === "payments" \? "payment" : "all"/);
  assert.match(app, /Payments and verification/);
  assert.match(app, /Your transport orders/);
  assert.match(sectionsCss, /customer-view-payments \.customer-new-order/);
  assert.match(sectionsCss, /customer-view-payments \.customer-order-card__actions \.is-primary/);
  assert.match(sectionsCss, /customer-view-payments \.customer-order-card__actions \.is-cancel/);
  assert.match(sectionsCss, /customer-view-payments \.customer-kpis > :not\(:nth-child\(3\)\)/);
  assert.match(sectionsCss, /customer-view-orders \.customer-hero/);
});

test("customer profile save explains and locks the pending workflow", () => {
  assert.match(profilePanel, /saveProfile = updateCustomerProfile/);
  assert.match(profilePanel, /if \(saving\) return;/);
  assert.match(profilePanel, /Saving your customer profile\. Editing and closing are temporarily locked until the update finishes\./);
  assert.match(profilePanel, /Piroofaayila maamilaa kee olkaa'aa jira\./);
  assert.match(profilePanel, /customer-profile-save-guidance/);
  assert.match(profilePanel, /aria-busy=\{saving\}/);
  assert.match(profilePanel, /aria-describedby=\{saving \? busyGuidanceId : undefined\}/);
  assert.match(profilePanel, /role="status" aria-live="polite"/);
  assert.match(profilePanel, /role="alert"/);
  assert.match(profilePanel, /disabled=\{saving\}/);
  assert.match(profilePanel, /title=\{saving \? busyMessage/);
  assert.match(profilePaymentsSmoke, /saveProfile: \(\) => new Promise\(\(\) => \{\}\)/);
  assert.match(profilePaymentsSmoke, /data-profile-busy-guidance/);
  assert.match(profilePaymentsSmoke, /data-profile-panel-busy/);
  assert.match(profilePaymentsSmoke, /data-profile-edit-locked/);
  assert.match(profilePaymentsSmoke, /data-profile-fields-locked/);
  assert.match(profilePaymentsSmoke, /data-profile-submit-locked/);
  assert.match(profilePaymentsSmoke, /\[320, 360, 390, 412, 430, 768\]/);
});
