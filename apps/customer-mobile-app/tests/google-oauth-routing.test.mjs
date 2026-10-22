import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/auth/google-sign-in.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { beginCustomerGoogleSignIn } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

test("Customer Google OAuth builds a same-tab browser redirect to the Customer route", async () => {
  let request;
  const client = {
    auth: {
      signInWithOAuth: async (args) => {
        request = args;
        return { data: { url: "https://example.supabase.co/auth/v1/authorize?provider=google" }, error: null };
      },
    },
  };
  const redirectTo = "https://hamiltontruck.github.io/hallotruck/customer-mobile/";
  const url = await beginCustomerGoogleSignIn(client, redirectTo);

  assert.equal(request.provider, "google");
  assert.deepEqual(request.options, {
    redirectTo,
    skipBrowserRedirect: true,
    queryParams: { prompt: "select_account" },
  });
  assert.match(url, /provider=google/);
});

test("Customer Google OAuth propagates provider errors", async () => {
  const error = new Error("provider is not enabled");
  const client = { auth: { signInWithOAuth: async () => ({ data: { url: null }, error }) } };
  await assert.rejects(beginCustomerGoogleSignIn(client, "https://example.test/customer-mobile/"), error);
});

test("Customer Google OAuth rejects a missing authorization URL", async () => {
  const client = { auth: { signInWithOAuth: async () => ({ data: { url: null }, error: null }) } };
  await assert.rejects(beginCustomerGoogleSignIn(client, "https://example.test/customer-mobile/"), /could not be started/);
});
