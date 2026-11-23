import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entry = fileURLToPath(new URL("../src/auth/customer-supabase.ts", import.meta.url));

async function configuredCustomerClient(config) {
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    define: { "import.meta.env": JSON.stringify(config) },
    plugins: [{
      name: "mock-supabase-client",
      setup(builder) {
        builder.onResolve({ filter: /^@supabase\\/supabase-js$/ }, () => ({
          path: "supabase-client", namespace: "qa-stub",
        }));
        builder.onLoad({ filter: /.*/, namespace: "qa-stub" }, () => ({
          contents: "export function createClient(url, key, options) { return { url, key, options }; }",
          loader: "js",
        }));
      },
    }],
  });
  const js = bundle.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

test("Customer V4 Supabase runtime opts into authorization-code PKCE without changing session ownership", async () => {
  const { customerSupabase, customerSupabaseConfigured } = await configuredCustomerClient({
    VITE_SUPABASE_URL: "https://qa-project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "qa-public-placeholder",
  });
  assert.equal(customerSupabaseConfigured, true);
  assert.equal(customerSupabase.url, "https://qa-project.supabase.co");
  assert.equal(customerSupabase.key, "qa-public-placeholder");
  assert.deepEqual(customerSupabase.options.auth, {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "hallo-customer-mobile-auth-v2",
  });
});

test("Customer V4 remains fail-closed if Supabase runtime configuration is absent", async () => {
  const { customerSupabase, customerSupabaseConfigured } = await configuredCustomerClient({});
  assert.equal(customerSupabaseConfigured, false);
  assert.equal(customerSupabase, null);
});

test("Customer OAuth redirect never adds the current query or hash to redirectTo", () => {
  const code = readFileSync(new URL("../src/auth/CustomerAuthBoundaryV2.tsx", import.meta.url), "utf8");
  assert.match(code, /const redirectTo = `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`/);
  assert.match(code, /window\.location\.assign\(url\)/);
  assert.doesNotMatch(code, /exchangeCodeForSession\(/);
});
