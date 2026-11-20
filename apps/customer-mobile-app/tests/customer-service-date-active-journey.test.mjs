import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const journey = fs.readFileSync(new URL("../src/CustomerBookingJourney.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const order = fs.readFileSync(new URL("../src/customer-order.service-v2.ts", import.meta.url), "utf8");
const copy = fs.readFileSync(new URL("../src/customer-final-copy.ts", import.meta.url), "utf8");
const compiled = await build({ entryPoints: [fileURLToPath(new URL("../src/customer-service-date.ts", import.meta.url))], bundle: true, write: false, platform: "node", format: "esm" });
const { todayInAddisAbaba, isValidCustomerServiceDate } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

test("active Customer V4 journey owns service-date entry on Cargo, read-only Review", () => {
  assert.match(app, /<CustomerBookingJourney/);
  const cargoStep = journey.slice(journey.indexOf('{step === "cargo"'), journey.indexOf('{step === "truck"'));
  const reviewStep = journey.slice(journey.indexOf('{step === "review"'));
  assert.match(cargoStep, /type="date"/);
  assert.match(cargoStep, /required/);
  assert.doesNotMatch(reviewStep, /type="date"/);
  assert.match(reviewStep, /!serviceDateReady && <p[^>]*role="alert">\{c.invalidServiceDate\}/);
  assert.ok(reviewStep.includes("<small>{c.serviceDate}</small>"));
  assert.ok(journey.includes("isValidCustomerServiceDate(serviceDate)"));
  assert.ok(order.includes("isValidCustomerServiceDate(input.serviceDate)"));
});

test("service-date validation rejects past, malformed and impossible dates", () => {
  const today = "2026-11-20";
  for (const value of ["", "2026-11-19", "2026-02-30", "2026-11-00", "2026-13-01", "tomorrow"]) assert.equal(isValidCustomerServiceDate(value, today), false, value);
  for (const value of ["2026-11-20", "2026-11-21", "2027-01-01", "2028-02-29"]) assert.equal(isValidCustomerServiceDate(value, today), true, value);
});

test("Ethiopia date changes at local midnight rather than browser UTC date", () => {
  assert.equal(todayInAddisAbaba(new Date("2026-11-19T20:59:59Z")), "2026-11-19");
  assert.equal(todayInAddisAbaba(new Date("2026-11-19T21:00:00Z")), "2026-11-20");
});

test("service-date labels and validation messages exist in all three languages", () => {
  assert.equal((copy.match(/serviceDate:/g) ?? []).length, 3);
  assert.equal((copy.match(/invalidServiceDate:/g) ?? []).length, 3);
});
