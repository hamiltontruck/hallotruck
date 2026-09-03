import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const css = await readFile(path.join(process.cwd(), "src/styles/customer-mobile-v4.css"), "utf8");

test("Customer v4 bottom navigation stays compact while preserving safe-area spacing", () => {
  assert.match(css, /min-height:\s*4\.3rem\s*!important/);
  assert.match(css, /padding-bottom:\s*calc\(4\.3rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /bottom:\s*calc\(4\.3rem \+ env\(safe-area-inset-bottom\)\)/);
});
