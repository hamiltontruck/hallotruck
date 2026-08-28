import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const service = await readFile(path.join(process.cwd(), "src/services/admin.service.ts"), "utf8");
const page = await readFile(path.join(process.cwd(), "src/pages/SmartLogistics.tsx"), "utf8");
const css = await readFile(path.join(process.cwd(), "src/styles/admin-order-cleanup.css"), "utf8");
const main = await readFile(path.join(process.cwd(), "src/main.tsx"), "utf8");

test("Admin orders expose assigned Driver and truck plate from database IDs", () => {
  assert.match(service, /driver_name: string \| null/);
  assert.match(service, /plate_number: string \| null/);
  assert.match(service, /drivers\.find\(\(item\) => item\.id === order\.driver_id\)/);
  assert.match(service, /trucks\.find\(\(item\) => item\.id === order\.truck_id\)/);
  assert.match(service, /assignment_label: assignmentLabel/);
  assert.match(service, /cargo_description: `\$\{cargoLabel\} · \$\{assignmentLabel\}`/);
});

test("Manage Order hides only the obsolete manual payment-entry form", () => {
  assert.match(css, /input\[name="provider"\]/);
  assert.match(css, /select\[name="event"\]/);
  assert.match(css, /display: none/);
  assert.match(main, /admin-order-cleanup\.css/);
});

test("Payment evidence, immutable history and invoice PDF remain visible", () => {
  assert.match(page, /Payment evidence/);
  assert.match(page, /No customer receipt attached/);
  assert.match(page, /Invoice \/ receipt PDF/);
  assert.match(page, /orderPayments\.map/);
});
