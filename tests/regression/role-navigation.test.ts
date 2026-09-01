import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const app = source("src/App.tsx");
const customerNav = source("src/components/customer/CustomerBottomNav.tsx");
const customerLiveOrders = source("src/pages/CustomerLiveOrders.tsx");
const driverNav = source("src/components/driver/DriverBottomNav.tsx");
const driverHeader = source("src/components/layout/Header.tsx");
const driverWallet = source("src/pages/DriverWallet.tsx");
const driverGate = source("src/components/auth/DriverGate.tsx");
const roleHome = source("src/components/auth/RoleHome.tsx");
const adminNav = source("src/components/admin/AdminMobileBottomNav.tsx");
const navigationCss = source("src/styles/role-navigation.css");
const main = source("src/main.tsx");

test("customer mobile navigation exposes five real portal routes", () => {
  for (const route of ["/customer", "/customer/orders", "/customer/track", "/customer/payments", "/customer/profile"]) {
    assert.match(customerNav, new RegExp(`to: "${route.replaceAll("/", "\\/")}"`));
    if (route !== "/customer") assert.match(app, new RegExp(`path="${route.replaceAll("/", "\\/")}"`));
  }
  assert.match(customerNav, /track: "Track"/);
  assert.match(customerNav, /track: "Hordoffii"/);
  assert.match(app, /section === "track"\) return .*<CustomerLiveOrders \/>/);
  assert.match(customerLiveOrders, /"quoted", "placed", "assigned", "accepted", "in_transit"/);
  assert.match(customerLiveOrders, /Waiting for verified driver assignment/);
  assert.match(customerLiveOrders, /\/customer\/tracking\/\$\{order\.id\}/);
});

test("driver primary navigation exposes canonical home, jobs, trip, wallet and profile routes", () => {
  for (const route of ["/driver", "/driver/jobs", "/driver/trip", "/driver/wallet", "/driver/profile"]) {
    assert.match(driverNav, new RegExp(`to: "${route.replaceAll("/", "\\/")}"`));
    assert.match(driverHeader, new RegExp(`to: "${route.replaceAll("/", "\\/")}"`));
  }
  assert.doesNotMatch(driverNav, /to: "\/driver\/documents"/);
  assert.doesNotMatch(driverHeader, /to: "\/driver\/documents"/);
  assert.match(driverNav, /wallet: "Wallet"/);
  assert.match(driverNav, /profile: "Profaayilii"/);
  assert.match(app, /path="\/driver" element={<DriverGate><DriverShell><JobBoard/);
  assert.match(app, /path="\/driver\/profile" element={<DriverGate><DriverShell><Documents/);
  assert.match(app, /path="\/driver\/documents" element={<DriverGate><Navigate to="\/driver\/profile" replace \/><\/DriverGate>}/);
  assert.match(app, /path="\/driver\/wallet" element={<DriverGate><DriverShell><DriverWallet/);
  assert.match(app, /path="\/driver\/earnings" element={<DriverGate><DriverShell><Earnings/);
  assert.doesNotMatch(app, /path="\/driver" element={<Navigate to="\/driver\/jobs"/);
});

test("root route and DriverGate derive roles from the current profile row", () => {
  assert.match(driverGate, /from\("profiles"\)[\s\S]*select\("role, driver_status"\)/);
  assert.match(driverGate, /profile\.role/);
  assert.match(driverGate, /profile\.driver_status/);
  assert.doesNotMatch(driverGate, /app_metadata|user_metadata/);

  assert.match(roleHome, /from\("profiles"\)[\s\S]*select\("role"\)/);
  assert.match(roleHome, /profile\?\.role/);
  assert.doesNotMatch(roleHome, /app_metadata|user_metadata/);
});

test("driver wallet keeps deposit, commission and trip earnings visibly separated", () => {
  assert.match(driverWallet, /<DriverDepositBalance language=\{language\} \/>/);
  assert.match(driverWallet, /<DriverCommissionWallet \/>/);
  assert.match(driverWallet, /to="\/driver\/earnings"/);
  assert.match(driverWallet, /Customer collections/);
  assert.match(driverWallet, /Driver earnings/);
  assert.match(driverWallet, /HALLO commission/);
});

test("admin mobile navigation provides exact overview, orders, combined fleet, finance and more actions", () => {
  for (const label of ["Overview", "Orders", "Fleet", "Finance", "More"]) {
    assert.match(adminNav, new RegExp(`label: "${label}"`));
  }
  assert.match(adminNav, /\/admin\/operations\?section=Fleet%20%26%20drivers/);
  assert.match(adminNav, /operationsSection === "Fleet & drivers"/);
  assert.match(app, /path="\/admin\/more"/);
  assert.match(app, /function AdminWorkspace\(\)\{return <AdminToolShell><AdminCeoOverview/);
});

test("mobile role navigation protects narrow screens, safe areas and open keyboards", () => {
  assert.match(navigationCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(navigationCss, /env\(safe-area-inset-bottom\)/);
  assert.match(navigationCss, /@media \(max-width: 639px\)/);
  assert.match(navigationCss, /@media \(max-width: 340px\)/);
  assert.match(navigationCss, /@media \(max-width: 639px\) and \(max-height: 520px\)/);
  assert.match(navigationCss, /display: none !important/);
  assert.match(navigationCss, /overflow-wrap: anywhere/);
  assert.match(navigationCss, /min-width: 0 !important/);
});

test("production runtime has a secure recovery boundary without console logging", () => {
  assert.match(main, /<Sentry\.ErrorBoundary/);
  assert.match(main, /sendDefaultPii: false/);
  assert.doesNotMatch(source("src/App.tsx"), /console\.(?:log|error|warn|debug)/);
});
