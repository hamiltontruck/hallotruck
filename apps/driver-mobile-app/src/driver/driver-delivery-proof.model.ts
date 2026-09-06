export type DriverSelectedPaymentMethod = "cash" | "bank_telebirr";
export type DriverTripPaymentResult = "cash_received" | "bank_telebirr" | "payment_not_received";

export type DriverDeliveryProofDraft = {
  recipientName: string;
  deliveryNote: string;
  photo: File | null;
  signature: Blob | null;
  paymentResult: DriverTripPaymentResult | "";
  amountCollected: string;
  paymentNote: string;
};

export type DriverDeliveryValidationContext = {
  orderStatus: "accepted" | "in_transit";
  selectedPaymentMethod: DriverSelectedPaymentMethod;
  tripAmountEtb: number | null;
};

export type DriverDeliveryValidationResult =
  | {
      ok: true;
      recipientName: string;
      deliveryNote: string;
      paymentResult: DriverTripPaymentResult;
      amountCollected: number | null;
      paymentNote: string;
    }
  | { ok: false; error: string };

export const MAX_DELIVERY_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_DELIVERY_NOTE_LENGTH = 1000;
export const MAX_PAYMENT_NOTE_LENGTH = 500;

function normalizedNote(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function allowedDriverPaymentResults(
  method: DriverSelectedPaymentMethod,
): DriverTripPaymentResult[] {
  return method === "cash"
    ? ["cash_received", "payment_not_received"]
    : ["bank_telebirr", "payment_not_received"];
}

export function validateDriverDeliveryProofDraft(
  draft: DriverDeliveryProofDraft,
  context: DriverDeliveryValidationContext,
): DriverDeliveryValidationResult {
  if (context.orderStatus !== "in_transit") {
    return { ok: false, error: "Trip must be In Transit before delivery can be completed." };
  }

  const recipientName = draft.recipientName.trim();
  if (recipientName.length < 2 || recipientName.length > 120) {
    return { ok: false, error: "Receiver name must be between 2 and 120 characters." };
  }

  if (!draft.photo || draft.photo.size <= 0 || !draft.photo.type.startsWith("image/")) {
    return { ok: false, error: "A delivery photo is required." };
  }
  if (draft.photo.size > MAX_DELIVERY_PHOTO_BYTES) {
    return { ok: false, error: "Delivery photo must be smaller than 8 MB." };
  }

  if (!draft.signature || draft.signature.size <= 0) {
    return { ok: false, error: "Receiver signature is required." };
  }

  if (!draft.paymentResult) {
    return { ok: false, error: "Choose the payment result before finishing the trip." };
  }
  if (!allowedDriverPaymentResults(context.selectedPaymentMethod).includes(draft.paymentResult)) {
    return context.selectedPaymentMethod === "cash"
      ? { ok: false, error: "The customer selected Cash for this order." }
      : { ok: false, error: "The customer selected Bank / Telebirr for this order." };
  }

  let amountCollected: number | null = null;
  if (draft.paymentResult === "cash_received") {
    if (context.tripAmountEtb === null || !Number.isFinite(context.tripAmountEtb) || context.tripAmountEtb <= 0) {
      return { ok: false, error: "The required trip amount is unavailable. Refresh the trip before finishing." };
    }
    const amount = Number(draft.amountCollected);
    if (!Number.isFinite(amount) || Math.abs(amount - context.tripAmountEtb) > 0.005) {
      return {
        ok: false,
        error: `Enter the exact collected amount: ETB ${context.tripAmountEtb.toLocaleString()}.`,
      };
    }
    amountCollected = amount;
  }

  return {
    ok: true,
    recipientName,
    deliveryNote: normalizedNote(draft.deliveryNote, MAX_DELIVERY_NOTE_LENGTH),
    paymentResult: draft.paymentResult,
    amountCollected,
    paymentNote: normalizedNote(draft.paymentNote, MAX_PAYMENT_NOTE_LENGTH),
  };
}

export function deliveryPhotoExtension(file: File): string {
  const mime = file.type.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "jpg";
}
