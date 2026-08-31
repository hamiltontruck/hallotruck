import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");
const statePath = "src/components/driver/DriverDepositBalanceState.tsx";
const wrapperPath = "src/components/driver/DriverDepositBalance.tsx";
const walletPath = "src/pages/DriverWallet.tsx";
const browserPath = "scripts/driver-deposit-e2e-smoke.mjs";

test("fulfilled-empty Driver deposit results never become false zero or endless loading", async () => {
  const source = await read(statePath);
  assert.match(source, /setSummary\(result\)/);
  assert.match(source, /setKnown\(true\)/);
  assert.match(source, /data-driver-deposit-state=\{known \? "unavailable" : "error"\}/);
  assert.match(source, /Retry before assuming a zero balance/);
  assert.doesNotMatch(source, /setSummary\(null\).*catch/s);
});

test("Driver deposit Retry and realtime refreshes share one synchronous lifecycle guard", async () => {
  const source = await read(statePath);
  assert.match(source, /const busyRef = useRef\(false\)/);
  assert.match(source, /if \(busyRef\.current\)/);
  assert.match(source, /reason === "realtime"/);
  assert.match(source, /queuedRealtimeRefreshRef\.current = true/);
  assert.match(source, /queueMicrotask\(\(\) => void runRef\.current\("realtime"\)\)/);
  assert.match(source, /data-deposit-retry="true"/);
});

test("failed Driver deposit refresh preserves confirmed balance and rejects obsolete responses", async () => {
  const source = await read(statePath);
  assert.match(source, /Your last confirmed balance remains visible/);
  assert.match(source, /requestIdRef/);
  assert.match(source, /!mountedRef\.current \|\| requestId !== requestIdRef\.current/);
  assert.match(source, /requestIdRef\.current \+= 1/);
  assert.doesNotMatch(source, /catch[\s\S]*setSummary\(null\)/);
});

test("Driver deposit state is localized, accessible and mobile safe", async () => {
  const source = await read(statePath);
  assert.match(source, /Deposit kee kan mirkanaa'e/);
  assert.match(source, /የተረጋገጠውን የዲፖዚት/);
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-busy/);
  assert.match(source, /min-w-0/);
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /sm:w-auto/);
});

test("production wrapper keeps canonical RPC authorization and filtered ledger refreshes", async () => {
  const [wrapper, wallet] = await Promise.all([read(wrapperPath), read(walletPath)]);
  assert.match(wrapper, /supabase\.rpc\("driver_financial_summary"/);
  assert.match(wrapper, /p_driver_id: auth\.user\.id/);
  assert.match(wrapper, /Number\.isFinite/);
  for (const table of [
    "driver_commission_deposits",
    "driver_commission_charges",
    "driver_payment_confirmations",
    "driver_commission_payments",
  ]) {
    assert.match(wrapper, new RegExp(`table: "${table}"`));
  }
  assert.match(wrapper, /filter = `driver_id=eq\.\$\{auth\.user\.id\}`/);
  assert.match(wrapper, /supabase\.removeChannel\(channel\)/);
  assert.match(wallet, /<DriverDepositBalance language=\{language\} \/>/);
});

test("Driver deposit browser smoke covers recovery, queueing, reversal and all mobile widths", async () => {
  const [browser, packageJson] = await Promise.all([read(browserPath), read("package.json")]);
  for (const marker of [
    "data-initial-unavailable",
    "data-retry-guarded",
    "data-preserved-confirmed",
    "data-queued-refresh",
    "data-recovered",
    "data-reversal-submitted",
    "data-overflow",
  ]) {
    assert.match(browser, new RegExp(marker));
  }
  assert.match(browser, /\[320, 360, 390, 412, 430, 768\]/);
  assert.equal((packageJson.match(/driver-deposit-e2e-smoke\.mjs/g) ?? []).length, 1);
});
