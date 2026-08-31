import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_DELIVERY_PHOTO_BYTES,
  allowedDriverPaymentResults,
  deliveryPhotoExtension,
  validateDriverDeliveryProofDraft,
} from "../.test-dist-delivery/driver-delivery-proof.model.js";

const serviceSource = readFileSync(new URL("../src/driver/driver-delivery-proof.service.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/driver/DriverDeliveryProofPanel.tsx", import.meta.url), "utf8");
const activeTripSource = readFileSync(new URL("../src/driver/DriverActiveTripView.tsx", import.meta.url), "utf8");

function photo(size = 1024, type = "image/jpeg") {
  return new File([new Uint8Array(size)], "delivery.jpg", { type });
}

function signature() {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
}

function draft(overrides = {}) {
  return {
    recipientName: "Abdi Tola",
    deliveryNote: "Cargo delivered in good condition",
    photo: photo(),
    signature: signature(),
    paymentResult: "cash_received",
    amountCollected: "12000",
    paymentNote: "",
    ...overrides,
  };
}

test("payment options remain constrained by the customer method", () => {
  assert.deepEqual(allowedDriverPaymentResults("cash"), ["cash_received", "payment_not_received"]);
  assert.deepEqual(allowedDriverPaymentResults("bank_telebirr"), ["bank_telebirr", "payment_not_received"]);
});

test("cash completion requires the exact trip amount", () => {
  const valid = validateDriverDeliveryProofDraft(draft(), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.amountCollected, 12000);

  const mismatch = validateDriverDeliveryProofDraft(draft({ amountCollected: "11999" }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(mismatch.ok, false);
});

test("bank and not-received results do not invent cash collection", () => {
  const bank = validateDriverDeliveryProofDraft(draft({
    paymentResult: "bank_telebirr",
    amountCollected: "",
  }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "bank_telebirr",
    tripAmountEtb: 12000,
  });
  assert.equal(bank.ok, true);
  if (bank.ok) assert.equal(bank.amountCollected, null);

  const outstanding = validateDriverDeliveryProofDraft(draft({
    paymentResult: "payment_not_received",
    amountCollected: "",
  }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(outstanding.ok, true);
  if (outstanding.ok) assert.equal(outstanding.amountCollected, null);
});

test("delivery proof rejects wrong lifecycle, method, files and receiver", () => {
  const accepted = validateDriverDeliveryProofDraft(draft(), {
    orderStatus: "accepted",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(accepted.ok, false);

  const wrongMethod = validateDriverDeliveryProofDraft(draft({ paymentResult: "bank_telebirr" }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(wrongMethod.ok, false);

  const tooLarge = validateDriverDeliveryProofDraft(draft({ photo: photo(MAX_DELIVERY_PHOTO_BYTES + 1) }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(tooLarge.ok, false);

  const noSignature = validateDriverDeliveryProofDraft(draft({ signature: null }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(noSignature.ok, false);

  const shortReceiver = validateDriverDeliveryProofDraft(draft({ recipientName: "A" }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(shortReceiver.ok, false);
});

test("photo extensions are derived from MIME type", () => {
  assert.equal(deliveryPhotoExtension(photo(10, "image/png")), "png");
  assert.equal(deliveryPhotoExtension(photo(10, "image/webp")), "webp");
  assert.equal(deliveryPhotoExtension(photo(10, "image/heic")), "heic");
  assert.equal(deliveryPhotoExtension(photo(10, "image/jpeg")), "jpg");
});

test("service preserves assignment, storage and atomic RPC boundaries", () => {
  assert.match(serviceSource, /\.eq\("driver_id", userId\)/);
  assert.match(serviceSource, /\.in\("status", \["accepted", "in_transit"\]\)/);
  assert.match(serviceSource, /DELIVERY_BUCKET = "delivery-proofs"/);
  assert.match(serviceSource, /client\.rpc\("driver_finish_trip"/);
  assert.match(serviceSource, /p_result_type: validated\.paymentResult/);
  assert.match(serviceSource, /fetchExistingProof\(client, input\.orderId\)/);
  assert.match(serviceSource, /removeUploads\(client, uploaded\)/);
  assert.doesNotMatch(serviceSource, /service_role|user_metadata|app_metadata/);
});

test("panel supports camera, gallery, signature and locked submission", () => {
  assert.match(panelSource, /capture="environment"/);
  assert.match(panelSource, /Receiver signature pad/);
  assert.match(panelSource, /submittingRef\.current/);
  assert.match(panelSource, /submitDriverDeliveryProof/);
  assert.match(panelSource, /payment_not_received/);
  assert.match(panelSource, /disabled=\{saving\}/);
});

test("active trip integrates completion only for in-transit orders", () => {
  assert.match(activeTripSource, /DriverDeliveryProofPanel/);
  assert.match(activeTripSource, /trip\.status === "in_transit"/);
  assert.match(activeTripSource, /clearQueuedDriverPings/);
  assert.match(activeTripSource, /completedTrackingId/);
});
