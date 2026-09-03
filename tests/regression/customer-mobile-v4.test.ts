import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const css = await readFile(path.join(process.cwd(), "src/styles/customer-mobile-v4.css"), "utf8");
const main = await readFile(path.join(process.cwd(), "src/main.tsx"), "utf8");
const nav = await readFile(path.join(process.cwd(), "src/components/customer/CustomerBottomNav.tsx"), "utf8");

test("Customer phone surfaces load the HALO v4 visual layer after existing customer overrides", () => {
  assert.match(main, /customer-mobile-header\.css[\s\S]*customer-mobile-v4\.css/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /--customer-v4-blue:\s*#0759c7/);
  assert.match(css, /--customer-v4-navy:\s*#10213d/);
  assert.match(css, /--customer-v4-gold:\s*#f5b400/);
});

test("Customer v4 bottom navigation remains compact, mobile-safe and preserves the five existing routes", () => {
  assert.match(css, /min-height:\s*4\.3rem\s*!important/);
  assert.match(css, /padding-bottom:\s*calc\(4\.3rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /customer-dashboard-nav__item\.is-active::after/);
  assert.match(nav, /to:\s*"\/customer"/);
  assert.match(nav, /to:\s*"\/customer\/orders"/);
  assert.match(nav, /to:\s*"\/customer\/track"/);
  assert.match(nav, /to:\s*"\/customer\/payments"/);
  assert.match(nav, /to:\s*"\/customer\/profile"/);
});

test("Customer v4 navigation uses shared line SVG icons instead of text glyphs", () => {
  assert.match(nav, /function CustomerNavIcon/);
  assert.match(nav, /viewBox="0 0 24 24"/);
  assert.match(nav, /stroke="currentColor"/);
  assert.doesNotMatch(nav, /icon:\s*"[⌂▤⌖◫◎]"/);
});
