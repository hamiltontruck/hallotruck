import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");

test("Netlify serves the GitHub Pages /hallotruck base path from the deploy root", () => {
  assert.match(config, /\[\[redirects\]\][\s\S]*from\s*=\s*["']\/hallotruck\/\*["']/);
  assert.match(config, /\[\[redirects\]\][\s\S]*to\s*=\s*["']\/:splat["']/);
  assert.match(config, /\[\[redirects\]\][\s\S]*status\s*=\s*200/);
  assert.match(config, /\[\[redirects\]\][\s\S]*force\s*=\s*true/);
});
