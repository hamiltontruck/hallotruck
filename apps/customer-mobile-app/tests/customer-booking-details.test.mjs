import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Customer booking exposes functional optional cargo details", () => {
  assert.match(app, /const \[cargoDetailsOpen, setCargoDetailsOpen\] = useState\(false\)/);
  assert.match(app, /const \[cargoNotes, setCargoNotes\] = useState\(""\)/);
  assert.match(app, /aria-expanded=\{cargoDetailsOpen\}/);
  assert.match(app, /aria-controls="customer-cargo-details"/);
  assert.match(app, /onClick=\{\(\) => setCargoDetailsOpen\(\(open\) => !open\)\}/);
  assert.match(app, /id="customer-cargo-details"/);
  assert.match(app, /maxLength=\{500\}/);
  assert.match(app, /Product name, handling instructions, quantity details/);
  assert.match(app, /Optional; does not change the transport quote/);
});

test("booking top bar no longer exposes a dead More action", () => {
  assert.doesNotMatch(app, /aria-label="More"/);
  assert.match(app, /aria-label="Back"/);
});

test("cargo details slice remains read-only", () => {
  assert.doesNotMatch(app, /\.insert\s*\(/);
  assert.doesNotMatch(app, /\.update\s*\(/);
  assert.doesNotMatch(app, /\.delete\s*\(/);
  assert.doesNotMatch(app, /createCustomerCargoOrder/);
  assert.match(app, /Order creation is not enabled yet/);
});
