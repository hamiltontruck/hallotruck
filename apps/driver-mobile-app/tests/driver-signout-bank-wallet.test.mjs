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

test("delivery payment always offers Cash and Bank / Wallet without payment-not-received", () => {
  assert.deepEqual(allowedDriverPaymentResults("cash"), ["cash_received", "bank_telebirr"]);
  assert.deepEqual(allowedDriverPaymentResults("bank_telebirr"), ["cash_received", "bank_telebirr"]);
  assert.match(panelSource, /data-driver-payment-choice="cash"/);
  assert.match(panelSource, /data-driver-payment-choice="bank-wallet"/);
  assert.doesNotMatch(panelSource, /payment_not_received/);
});

test("Cash and Bank / Wallet both require the exact trip amount", () => {
  for (const paymentResult of ["cash_received", "bank_telebirr"]) {
    const valid = validateDriverDeliveryProofDraft(draft({ paymentResult }), {
      orderStatus: "in_transit",
      selectedPaymentMethod: "cash",
      tripAmountEtb: 10500,
    });
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(valid.amountCollected, 10500);

    const mismatch = validateDriverDeliveryProofDraft(draft({ paymentResult, amountCollected: "10499" }), {
      orderStatus: "in_transit",
      selectedPaymentMethod: "cash",
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
});
