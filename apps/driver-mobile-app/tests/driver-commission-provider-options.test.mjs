import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/driver/DriverCommissionPaymentPanel.tsx", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/driver/driver-v4-i18n.ts", import.meta.url), "utf8");

test("commission deposit form separates bank and wallet provider choices", () => {
  for (const option of ["CBE", "Awash Bank", "Dashen Bank", "Other Bank", "Telebirr", "M-Pesa", "eBirr", "Other Wallet"]) {
    assert.match(panel, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /providerKind/);
  assert.match(panel, /providerChoice/);
});

test("commission deposit form keeps evidence and Admin-review submission semantics", () => {
  assert.match(panel, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(panel, /t\.commission\.submitDeposit/);
  assert.match(i18n, /submitDeposit:\s*"Submit deposit commission"/);
  assert.match(i18n, /adminConfirmation/);
});
