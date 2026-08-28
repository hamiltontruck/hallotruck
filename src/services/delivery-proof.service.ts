import { supabase } from "./supabase.client";

export interface DeliveryProofInput {
  orderId: string;
  recipientName: string;
  deliveryNote: string;
  photo: File;
  signature: Blob;
  paymentResult: "cash_received" | "bank_telebirr" | "payment_not_received";
  amountCollected?: number;
  paymentNote?: string;
}

function fail(message: string): never {
  throw new Error(message);
}

export async function submitDeliveryProof(input: DeliveryProofInput) {
  const recipientName = input.recipientName.trim();
  if (recipientName.length < 2 || recipientName.length > 120) {
    fail("Recipient name must be between 2 and 120 characters.");
  }
  if (!input.photo.type.startsWith("image/")) {
    fail("Delivery photo must be an image.");
  }
  if (input.photo.size > 8 * 1024 * 1024) {
    fail("Delivery photo must be smaller than 8 MB.");
  }

  const existing = await supabase
    .from("delivery_proofs")
    .select("photo_path,signature_path")
    .eq("order_id", input.orderId)
    .maybeSingle();
  if (existing.error) fail(existing.error.message);
  if (existing.data) return;

  const stamp = Date.now();
  const extension =
    input.photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const photoPath = `${input.orderId}/${stamp}-delivery.${extension}`;
  const signaturePath = `${input.orderId}/${stamp}-signature.png`;
  const uploaded: string[] = [];

  try {
    const photoUpload = await supabase.storage
      .from("delivery-proofs")
      .upload(photoPath, input.photo, {
        contentType: input.photo.type,
        upsert: false,
      });
    if (photoUpload.error) fail(photoUpload.error.message);
    uploaded.push(photoPath);

    const signatureUpload = await supabase.storage
      .from("delivery-proofs")
      .upload(signaturePath, input.signature, {
        contentType: "image/png",
        upsert: false,
      });
    if (signatureUpload.error) fail(signatureUpload.error.message);
    uploaded.push(signaturePath);

    const { error } = await supabase.rpc("driver_finish_trip", {
      p_order_id: input.orderId,
      p_recipient_name: recipientName,
      p_delivery_note: input.deliveryNote.trim() || null,
      p_photo_path: photoPath,
      p_signature_path: signaturePath,
      p_result_type: input.paymentResult,
      p_amount_collected: input.amountCollected ?? null,
      p_payment_note: input.paymentNote?.trim() || null,
    });
    if (error) fail(error.message);

    const recorded = await supabase
      .from("delivery_proofs")
      .select("photo_path,signature_path")
      .eq("order_id", input.orderId)
      .single();
    if (!recorded.error && recorded.data
      && (recorded.data.photo_path !== photoPath || recorded.data.signature_path !== signaturePath)) {
      await supabase.storage.from("delivery-proofs").remove(uploaded);
      uploaded.length = 0;
    }
  } catch (error) {
    if (uploaded.length) {
      await supabase.storage.from("delivery-proofs").remove(uploaded);
    }
    throw error;
  }
}
