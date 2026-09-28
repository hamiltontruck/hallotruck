import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/AdminCrmRegistry.tsx", "utf8");

test("Admin CRM supports 50 or 100 rows per page with 50 as the default", () => {
  assert.match(page, /useState<50 \| 100>\(50\)/);
  assert.match(page, /<option value=\{50\}>50<\/option>/);
  assert.match(page, /<option value=\{100\}>100<\/option>/);
  assert.match(page, /Rows per page/);
});

test("Admin CRM paginates the filtered Customer and Driver registries", () => {
  assert.match(page, /customerRows\.slice\(/);
  assert.match(page, /driverRows\.slice\(/);
});

test("Driver document counts clearly distinguish approved from submitted", () => {
  assert.match(page, /\/8 approved/);
  assert.match(page, /\/8 submitted/);
});

test("mobile registry cards use compact vertical spacing", () => {
  assert.match(page, /className="p-3 sm:p-4"/);
  assert.match(page, /gap-2[^\"]*xl:gap-3/);
});
