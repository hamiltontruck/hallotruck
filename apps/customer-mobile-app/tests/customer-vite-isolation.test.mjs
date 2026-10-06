import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("Customer Vite build uses an inline empty PostCSS pipeline instead of the repository root config", () => {
  assert.match(viteConfig, /css\s*:\s*\{/);
  assert.match(viteConfig, /postcss\s*:\s*\{\s*plugins\s*:\s*\[\s*\]\s*,?\s*\}/s);
  assert.doesNotMatch(viteConfig, /postcss\s*:\s*fileURLToPath/);
});
