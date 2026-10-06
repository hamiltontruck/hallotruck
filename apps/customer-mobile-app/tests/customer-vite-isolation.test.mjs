import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("Customer Vite build isolates itself from the repository root PostCSS config", () => {
  assert.match(viteConfig, /fileURLToPath/);
  assert.match(viteConfig, /css\s*:\s*\{/);
  assert.match(viteConfig, /postcss\s*:\s*fileURLToPath\(new URL\("\.\/", import\.meta\.url\)\)/);
});
