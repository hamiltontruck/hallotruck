import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const authBoundarySource = await readFile(new URL("../src/auth/MobileAuthBoundary.tsx", import.meta.url), "utf8");
const accessPolicySource = await readFile(new URL("../src/auth/access-policy.ts", import.meta.url), "utf8");

test("Customer mobile identity comes from the database-backed profile and fails closed for unsupported roles", () => {
  assert.match(authBoundarySource, /\.from\("profiles"\)[\s\S]*\.select\("role,driver_status,full_name"\)/);
  assert.match(authBoundarySource, /const access = classifyMobileProfile\(data\)/);
  assert.match(accessPolicySource, /if \(role === "customer"\)[\s\S]*role: "customer"/);
  assert.match(accessPolicySource, /return \{ kind: "unsupported-role", role \}/);
  assert.doesNotMatch(authBoundarySource, /user_metadata|app_metadata/);
});

test("Customer tabs resolve only to Customer surfaces", () => {
  assert.match(appSource, /if \(tab === "home"\) return role === "driver" \? <DriverHome[\s\S]*: <CustomerHome/);
  assert.match(appSource, /if \(role === "customer"\) return <CustomerShipmentsView state=\{customerState\} \/>/);
  assert.match(appSource, /if \(tab === "wallet"\) return role === "driver" \? <DriverWalletView[\s\S]*: <CustomerPaymentsView/);
  assert.match(appSource, /return role === "driver" \? <DriverProfileView[\s\S]*: <CustomerProfileView/);
  assert.match(appSource, /CustomerLiveMapView/);
  assert.match(appSource, /DriverActiveTripView/);
});

test("Customer navigation exposes no Driver-only tab labels or actions", () => {
  assert.match(appSource, /aria-label=\{`\$\{role\} navigation`\}/);
  assert.match(appSource, /role === "driver" \? "Hojii" : "Fe'umsa"/);
  assert.doesNotMatch(appSource, /role === "customer"[^\n]*DriverJobsBoard/);
  assert.doesNotMatch(appSource, /role === "customer"[^\n]*DriverWalletView/);
  assert.doesNotMatch(appSource, /role === "customer"[^\n]*DriverProfileView/);
});
