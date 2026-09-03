import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const page = await readFile(path.join(process.cwd(), "src/pages/CustomerMapHome.tsx"), "utf8");
const css = await readFile(path.join(process.cwd(), "src/styles/customer-mobile-header.css"), "utf8");
const main = await readFile(path.join(process.cwd(), "src/main.tsx"), "utf8");

test("Customer booking hides the large portal header only on phones", () => {
  assert.match(page, /customer-map-home__header/);
  assert.match(main, /customer-premium-booking-ui\.css[\s\S]*customer-mobile-header\.css/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /customer-map-home__header[\s\S]*display:\s*none\s*!important/);
});
