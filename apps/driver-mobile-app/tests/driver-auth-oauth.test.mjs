import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Load the pure TypeScript adapter, without a browser or production credentials.
const source = readFileSync(new URL('../src/auth/google-sign-in.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { driverAuthRedirect, beginGoogleSignIn } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('OAuth returns to the driver app deployed subpath', () => {
  assert.equal(driverAuthRedirect('https://hamiltontruck.github.io', '/hallotruck/driver-mobile/'), 'https://hamiltontruck.github.io/hallotruck/driver-mobile/');
  assert.equal(driverAuthRedirect('http://localhost:4173', '/hallotruck/driver-mobile/'), 'http://localhost:4173/hallotruck/driver-mobile/');
});
test('Google adapter requests only Google identity and preserves the driver redirect', async () => {
  let request;
  const client = { auth: { signInWithOAuth: async (args) => { request = args; return { data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' }, error: null }; } } };
  const url = await beginGoogleSignIn(client, 'https://hamiltontruck.github.io/hallotruck/driver-mobile/');
  assert.equal(request.provider, 'google');
  assert.deepEqual(request.options, { redirectTo: 'https://hamiltontruck.github.io/hallotruck/driver-mobile/', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } });
  assert.match(url, /provider=google/);
});
test('OAuth provider errors propagate without redirecting or fabricating a session', async () => {
  const error = new Error('provider disabled');
  const client = { auth: { signInWithOAuth: async () => ({ data: { url: null }, error }) } };
  await assert.rejects(beginGoogleSignIn(client, 'https://example.test/driver-mobile/'), error);
});
test('OAuth rejects an empty authorization URL', async () => {
  const client = { auth: { signInWithOAuth: async () => ({ data: { url: null }, error: null }) } };
  await assert.rejects(beginGoogleSignIn(client, 'https://example.test/driver-mobile/'), /could not be started/);
});
