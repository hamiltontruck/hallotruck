import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.join(process.cwd(), "src/pages/SmartLogistics.tsx"), "utf8");

test("Admin Operations overview KPIs open exact filtered workspaces", () => {
  for (const target of [
    "/admin/operations?section=Orders",
    "/admin/operations?section=Fleet%20%26%20drivers&fleet_status=available",
    "/admin/operations?section=Orders&status=delivered",
    "/admin/operations?section=Finance&payment_status=released",
  ]) {
    assert.ok(source.includes(target), `Missing actionable KPI target: ${target}`);
  }
  assert.match(source, /function Kpi\([^)]*to/);
  assert.match(source, /<Link to=\{to\} aria-label=/);
});

test("Orders, Fleet, Drivers, Finance and search state are URL-backed", () => {
  for (const key of ["q", "status", "queue", "date", "fleet_status", "driver_status", "payment_status"]) {
    assert.ok(
      source.includes(`next.set("${key}"`)
        || source.includes(`next.delete("${key}"`)
        || source.includes(`searchParams.get("${key}"`),
      `${key} is not URL-backed`,
    );
  }
  assert.match(source, /initialFleetStatus=\{searchParams\.get\("fleet_status"\)/);
  assert.match(source, /initialDriverStatus=\{searchParams\.get\("driver_status"\)/);
  assert.match(source, /initialPaymentStatus=\{searchParams\.get\("payment_status"\)/);
  assert.match(source, /onFilter\("status",status\)/);
  assert.match(source, /onFilter\("fleet_status",status\)/);
  assert.match(source, /onFilter\("driver_status",status\)/);
  assert.match(source, /onFilter\("payment_status",status\)/);
});

test("Admin Operations filters and navigation expose keyboard and screen-reader state", () => {
  assert.match(source, /aria-current=\{section === label \? "page"/);
  assert.match(source, /aria-expanded=\{menuOpen\}/);
  assert.match(source, /aria-controls="admin-operations-menu"/);
  assert.match(source, /aria-pressed=\{selected===value\}/);
  assert.match(source, /<fieldset/);
  assert.match(source, /focus-visible:outline/);
  assert.doesNotMatch(source, /href="#\/admin\/driver-compliance"/);
});

test("Admin Operations stays mobile-safe through 430px and supports deterministic fixtures", () => {
  assert.match(source, /SmartLogisticsFixture/);
  assert.match(source, /fixture\?\.metrics/);
  assert.match(source, /min-\[360px\]:p-5/);
  assert.match(source, /min-\[430px\]:flex-none/);
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(source, /overflow-hidden bg-white border/);
});
