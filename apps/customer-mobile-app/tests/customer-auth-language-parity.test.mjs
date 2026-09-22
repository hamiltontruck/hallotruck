import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/auth-language-compact.css", import.meta.url), "utf8");
const labels = fs.readFileSync(new URL("../src/auth-language-labels.ts", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Customer auth language control uses semantic top-right placement without brittle style selectors", () => {
  assert.match(css, /\.customer-auth-shell\{[^}]*padding-top:54px/);
  assert.match(css, /\.customer-auth-language\{[^}]*top:4px/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.doesNotMatch(css, /\[style\*=/);
  assert.doesNotMatch(css, /nth-of-type|first-of-type/);
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

test("Customer auth styling uses stable semantic classes rather than DOM-position overrides", () => {
  assert.match(css, /\.customer-auth-screen/);
  assert.match(css, /\.customer-auth-shell/);
  assert.match(css, /\.customer-auth-language/);
  assert.doesNotMatch(css, /main>div|main>section|label:first-child/);
});
