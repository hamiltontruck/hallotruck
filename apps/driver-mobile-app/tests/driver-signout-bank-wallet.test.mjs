import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  allowedDriverPaymentResults,
  validateDriverDeliveryProofDraft,
} from "../.test-dist-delivery/driver-delivery-proof.model.js";

const panelSource = readFileSync(new URL("../src/driver/DriverDeliveryProofPanel.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../src/driver/DriverProfileView.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/DriverWorkspace.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../src/auth.tsx", import.meta.url), "utf8");
const authStyles = readFileSync(new URL("../src/auth/driver-auth.css", import.meta.url), "utf8");

function photo() {
  return new File([new Uint8Array(1024)], "delivery.jpg", { type: "image/jpeg" });
}

function signature() {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
}

function draft(overrides = {}) {
  return {
    recipientName: "Abdi Tola",
    deliveryNote: "Delivered",
    photo: photo(),
    signature: signature(),
    paymentResult: "cash_received",
    amountCollected: "10500",
    paymentNote: "",
    ...overrides,
  };
}

test("delivery payment offers only the result authorized by the order", () => {
  assert.deepEqual(allowedDriverPaymentResults("cash"), ["cash_received"]);
  assert.deepEqual(allowedDriverPaymentResults("bank_telebirr"), ["bank_telebirr"]);
  assert.match(panelSource, /data-driver-payment-choice="cash"/);
  assert.match(panelSource, /data-driver-payment-choice="bank-wallet"/);
  assert.doesNotMatch(panelSource, /payment_not_received/);
});

test("Cash and Bank / Wallet both require the exact trip amount on matching orders", () => {
  for (const [paymentResult, selectedPaymentMethod] of [
    ["cash_received", "cash"],
    ["bank_telebirr", "bank_telebirr"],
  ]) {
    const valid = validateDriverDeliveryProofDraft(draft({ paymentResult }), {
      orderStatus: "in_transit",
      selectedPaymentMethod,
      tripAmountEtb: 10500,
    });
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(valid.amountCollected, 10500);

    const mismatch = validateDriverDeliveryProofDraft(draft({ paymentResult, amountCollected: "10499" }), {
      orderStatus: "in_transit",
      selectedPaymentMethod,
      tripAmountEtb: 10500,
    });
    assert.equal(mismatch.ok, false);
  }
  assert.match(panelSource, /paymentResult === "cash_received" \|\| paymentResult === "bank_telebirr"/);
});

test("Driver Profile exposes a full-width bottom Sign out action wired to Supabase auth", () => {
  assert.match(profileSource, /onSignOut/);
  assert.match(profileSource, /data-driver-profile-sign-out/);
  assert.match(profileSource, /min-h-12[^\"]*w-full|w-full[^\"]*min-h-12/);
  assert.match(workspaceSource, /<DriverProfileView[\s\S]*onSignOut=\{\(\) => void supabase\.auth\.signOut\(\)\}/);
  assert.equal((workspaceSource.match(/supabase\.auth\.signOut\(\)/g) ?? []).length, 1);
});

test("Driver login language control uses direct compact EN OR and Amharic buttons", () => {
  assert.doesNotMatch(authSource, /<select[^>]*aria-label=\{text\.language\}/);
  assert.match(authSource, /\[\['en', 'EN'\], \['om', 'OR'\], \['am', 'አማ'\]\]/);
  assert.match(authSource, /data-driver-auth-language=\{code\}/);
  assert.match(authSource, /onClick=\{\(\) => setLanguage\(code\)\}/);
  assert.match(authSource, /aria-pressed=\{language === code\}/);
  assert.match(authStyles, /\.driver-auth-language\{[^}]*display:grid[^}]*grid-template-columns:repeat\(3,1fr\)/);
});

test("Driver login keeps the compact language control below the unobstructed brand", () => {
  assert.match(authSource, /<AuthBrand \/>[\s\S]*<div className="driver-auth-language"/);
  assert.doesNotMatch(authSource, /<div className="driver-auth-top">[\s\S]*driver-auth-language/);
  assert.match(authStyles, /\.driver-auth-language\{[^}]*width:144px[^}]*margin:16px auto 0/);
  assert.match(authStyles, /\.driver-auth-content\{[^}]*env\(safe-area-inset-top\)/);
});
