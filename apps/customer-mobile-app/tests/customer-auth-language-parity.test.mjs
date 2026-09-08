import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/auth-language-compact.css", import.meta.url), "utf8");
const labels = fs.readFileSync(new URL("../src/auth-language-labels.ts", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Customer auth language control uses Driver-style top-right placement instead of clipping above the viewport", () => {
  assert.match(css, /padding-top:54px/);
  assert.match(css, /top:4px/);
  assert.doesNotMatch(css, /top:-48px/);
  assert.doesNotMatch(css, /top:-44px/);
  assert.match(css, /@media\(max-width:360px\)/);
});

test("Customer auth language labels are compact EN, OR and Amharic abbreviation", () => {
  assert.match(labels, /en: "EN"/);
  assert.match(labels, /om: "OR"/);
  assert.match(labels, /am: "አማ"/);
  assert.match(labels, /values\.includes\("en"\)/);
  assert.match(labels, /values\.includes\("om"\)/);
  assert.match(labels, /values\.includes\("am"\)/);
  assert.match(main, /import "\.\/auth-language-labels"/);
});

test("Customer signed-out card hides the redundant intro block and lifts the form", () => {
  assert.match(css, /label:first-child\+p,/);
  assert.match(css, /label:first-child\+p\+h1,/);
  assert.match(css, /label:first-child\+p\+h1\+p\{display:none!important\}/);
  assert.match(css, /label:first-child\+p\+h1\+p\+form\{margin-top:0!important\}/);
});
