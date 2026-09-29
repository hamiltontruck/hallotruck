import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_DELIVERY_PHOTO_BYTES,
  allowedDriverPaymentResults,
  deliveryPhotoExtension,
  validateDriverDeliveryProofDraft,
} from "../.test-dist-delivery/driver-delivery-proof.model.js";
import * as deliveryProofModel from "../.test-dist-delivery/driver-delivery-proof.model.js";

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

test("payment options allow cash or bank wallet at delivery", () => {
  const expected = ["cash_received", "bank_telebirr"];
  assert.deepEqual(allowedDriverPaymentResults("cash"), expected);
  assert.deepEqual(allowedDriverPaymentResults("bank_telebirr"), expected);
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

test("bank wallet requires the exact trip amount and not-received stays unavailable", () => {
  const bank = validateDriverDeliveryProofDraft(draft({
    paymentResult: "bank_telebirr",
    amountCollected: "12000",
  }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "bank_telebirr",
    tripAmountEtb: 12000,
  });
  assert.equal(bank.ok, true);
  if (bank.ok) assert.equal(bank.amountCollected, 12000);

  const outstanding = validateDriverDeliveryProofDraft(draft({
    paymentResult: "payment_not_received",
    amountCollected: "",
  }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(outstanding.ok, false);
});

test("delivery proof rejects wrong lifecycle, method, files and receiver", () => {
  const accepted = validateDriverDeliveryProofDraft(draft(), {
    orderStatus: "accepted",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(accepted.ok, false);
  const alternatePayment = validateDriverDeliveryProofDraft(draft({ paymentResult: "bank_telebirr" }), {
    orderStatus: "in_transit",
    selectedPaymentMethod: "cash",
    tripAmountEtb: 12000,
  });
  assert.equal(alternatePayment.ok, true);

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

test("complete trip stays locked until all four proof steps are ready", () => {
  assert.equal(typeof deliveryProofModel.canSubmitDriverDeliveryProof, "function");
  const canSubmitDriverDeliveryProof = deliveryProofModel.canSubmitDriverDeliveryProof;
  assert.equal(canSubmitDriverDeliveryProof({
    receiverReady: true,
    photoReady: false,
    signatureReady: true,
    paymentReady: true,
  }), false);
  assert.equal(canSubmitDriverDeliveryProof({
    receiverReady: true,
    photoReady: true,
    signatureReady: true,
    paymentReady: true,
  }), true);
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
  assert.match(panelSource, /aria-label=\{t\.deliveryProof\.signatureStep\}/);
  assert.match(panelSource, /submittingRef\.current/);
  assert.match(panelSource, /submitDriverDeliveryProof/);
  assert.doesNotMatch(panelSource, /payment_not_received/);
  assert.match(panelSource, /canSubmitDriverDeliveryProof/);
  assert.match(panelSource, /disabled=\{saving \|\| !completionReady\}/);
});

test("delivery proof bottom sheet keeps its header visible while the complete-trip form scrolls", () => {
  assert.match(panelSource, /data-driver-delivery-proof-sheet[^>]*className="[^"]*flex[^"]*flex-col[^"]*overflow-hidden/);
  assert.match(panelSource, /data-driver-delivery-proof-header[^>]*className="[^"]*shrink-0/);
  assert.doesNotMatch(panelSource, /data-driver-delivery-proof-header[^>]*className="[^"]*sticky/);
  assert.match(panelSource, /data-driver-delivery-proof-scroll-region[^>]*className="[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto[^"]*overscroll-contain/);
});

test("active trip integrates completion only for in-transit orders", () => {
  assert.match(activeTripSource, /DriverDeliveryProofPanel/);
  assert.match(activeTripSource, /trip\.status === "in_transit"/);
  assert.match(activeTripSource, /clearQueuedDriverPings/);
  assert.match(activeTripSource, /completedTrackingId/);
  assert.doesNotMatch(activeTripSource, /t\.trip\.assignedDriver/);
});

test("delivery proof renders above the workspace bottom navigation through a document-body portal", () => {
  assert.match(panelSource, /createPortal/);
  assert.match(panelSource, /document\.body/);
  assert.match(panelSource, /fixed inset-0 z-\[100\]/);
});
