import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const app = source("src/App.tsx");
const customerNav = source("src/components/customer/CustomerBottomNav.tsx");
const driverNav = source("src/components/driver/DriverBottomNav.tsx");
const adminNav = source("src/components/admin/AdminMobileBottomNav.tsx");
const navigationCss = source("src/styles/role-navigation.css");
const main = source("src/main.tsx");

test("customer mobile navigation exposes five real portal routes", () => {
  for (const route of ["/customer", "/customer/orders", "/customer/track", "/customer/payments", "/customer/profile"]) {
    assert.match(customerNav, new RegExp(`to: "${route.replaceAll("/", "\\/")}"`));
    if (route !== "/customer") assert.match(app, new RegExp(`path="${route.replaceAll("/", "\\/")}"`));
  }
  assert.match(app, /section === "track" \? "active" : section === "payments" \? "payment" : "all"/);
});

test("driver mobile navigation keeps five role-safe destinations and exposes trip history", () => {
  for (const route of ["/driver", "/driver/jobs", "/driver/trip", "/driver/earnings", "/driver/documents"]) {
    assert.match(driverNav, new RegExp(`to: "${route.replaceAll("/", "\\/")}"`));
  }
  assert.match(driverNav, /history: "History"/);
  assert.match(driverNav, /history: "Seenaa"/);
  assert.match(app, /path="\/driver" element={<DriverGate><DriverShell><JobBoard/);
  assert.match(app, /path="\/driver\/earnings" element={<DriverGate><DriverShell><Earnings/);
  assert.doesNotMatch(app, /path="\/driver" element={<Navigate to="\/driver\/jobs"/);
});

test("admin mobile navigation provides exact overview, orders, fleet, finance and more actions", () => {
  for (const label of ["Overview", "Orders", "Fleet", "Finance", "More"]) {
    assert.match(adminNav, new RegExp(`label: "${label}"`));
  }
  assert.match(app, /path="\/admin\/more"/);
  assert.match(app, /function AdminWorkspace\(\)\{return <AdminToolShell><AdminCeoOverview/);
});

test("mobile role navigation protects narrow screens and device safe areas", () => {
  assert.match(navigationCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(navigationCss, /env\(safe-area-inset-bottom\)/);
  assert.match(navigationCss, /@media \(max-width: 639px\)/);
  assert.match(navigationCss, /min-width: 0 !important/);
});

test("production runtime has a secure recovery boundary without console logging", () => {
  assert.match(main, /<Sentry\.ErrorBoundary/);
  assert.match(main, /sendDefaultPii: false/);
  assert.doesNotMatch(source("src/App.tsx"), /console\.(?:log|error|warn|debug)/);
});
