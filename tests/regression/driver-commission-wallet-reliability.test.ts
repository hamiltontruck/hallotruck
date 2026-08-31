import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const state = read("src/components/driver/DriverCommissionWalletState.tsx");
const wrapper = read("src/components/driver/DriverCommissionWallet.tsx");
const service = read("src/services/driver-commission.service.ts");
const browser = read("scripts/driver-commission-wallet-e2e-smoke.mjs");
const packageJson = read("package.json");

test("Driver commission wallet loads summary and history independently", () => {
  assert.match(state, /Promise\.allSettled/);
  assert.match(state, /summaryResult\.status === "fulfilled"/);
  assert.match(state, /paymentsResult\.status === "fulfilled"/);
  assert.match(state, /setSummaryKnown\(true\)/);
  assert.match(state, /setPaymentsKnown\(true\)/);
  assert.doesNotMatch(state, /setSummary\(null\).*summaryResult\.status/s);
  assert.doesNotMatch(state, /setPayments\(\[\]\).*paymentsResult\.status/s);
});

test("unknown wallet sources never render false zero or false empty states", () => {
  assert.match(state, /summaryKnown && summary/);
  assert.match(state, /paymentsKnown && payments\.length === 0/);
  assert.match(state, /!paymentsKnown && !loading/);
  assert.match(state, /data-wallet-source-error=\{hasConfirmedSource \? "partial" : "full"\}/);
  assert.match(state, /data-balance-state=\{summaryKnown \? "ready" : loading \? "loading" : "unavailable"\}/);
});

test("wallet retries and receipt actions are synchronously guarded", () => {
  assert.match(state, /loadBusyRef\.current/);
  assert.match(state, /saveBusyRef\.current/);
  assert.match(state, /receiptBusyRef\.current/);
  assert.match(state, /requestIdRef\.current/);
  assert.match(state, /requestId !== requestIdRef\.current/);
  assert.match(state, /mountedRef\.current = false/);
});

test("wallet failures remain visible, retryable, localized and accessible", () => {
  assert.match(state, /role="alert"/);
  assert.match(state, /aria-busy=\{loading\}/);
  assert.match(state, /aria-describedby="commission-submit-guidance"/);
  assert.match(state, /partialFailure/);
  assert.match(state, /WALLETII KOMISHINII HALLO SMART/);
  assert.match(state, /HALLO SMART ኮሚሽን ዋሌት/);
  assert.match(state, /min-w-0/);
  assert.match(state, /overflow-x-hidden/);
});

test("production wrapper preserves existing database-backed commission boundaries", () => {
  assert.match(wrapper, /loadSummary=\{getMyCommissionSummary\}/);
  assert.match(wrapper, /loadPayments=\{getMyCommissionPayments\}/);
  assert.match(wrapper, /submitPayment=\{submitCommissionPayment\}/);
  assert.match(wrapper, /openReceipt=\{openCommissionReceipt\}/);
  assert.match(service, /supabase\.rpc\("my_driver_commission_summary"\)/);
  assert.match(service, /\.from\("driver_commission_payments"\)/);
  assert.match(service, /supabase\.rpc\("submit_driver_commission_payment"/);
  assert.match(service, /createSignedUrl\(path, 300\)/);
});

test("browser smoke covers independent failures, recovery, action guards and mobile widths", () => {
  assert.match(browser, /initialSummaryVisible/);
  assert.match(browser, /secondaryHistoryVisible/);
  assert.match(browser, /retryCallsGuarded/);
  assert.match(browser, /summaryPreserved/);
  assert.match(browser, /receiptGuarded/);
  assert.match(browser, /\[320, 360, 390, 412, 430, 768\]/);
  assert.match(browser, /data-overflow/);
  assert.equal((packageJson.match(/driver-commission-wallet-e2e-smoke\.mjs/g) ?? []).length, 1);
});
