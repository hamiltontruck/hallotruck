import type { SupabaseClient, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  deliveryPhotoExtension,
  validateDriverDeliveryProofDraft,
  type DriverDeliveryProofDraft,
  type DriverSelectedPaymentMethod,
} from "./driver-delivery-proof.model";

const DELIVERY_BUCKET = "delivery-proofs";

type ServerTrip = {
  id: string;
  status: "accepted" | "in_transit";
  priceEtb: number | null;
  selectedPaymentMethod: DriverSelectedPaymentMethod;
};

type ExistingProof = {
  id: string;
  photo_path: string;
  signature_path: string;
};

export type SubmitDriverDeliveryProofInput = {
  expectedUserId: string;
  orderId: string;
  draft: DriverDeliveryProofDraft;
};

export type SubmitDriverDeliveryProofResult = {
  resultId: string | null;
  alreadyCompleted: boolean;
};

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<{
  client: SupabaseClient;
  user: User;
}> {
  const client = requireClient();
  const [userResult, sessionResult] = await Promise.all([
    client.auth.getUser(),
    client.auth.getSession(),
  ]);
  const user = userResult.data.user;
  const session = sessionResult.data.session;
  if (userResult.error || sessionResult.error || !user || !session) {
    throw new Error("Driver session xumurameera. Deebi'ii seeni.");
  }
  if (user.id !== expectedUserId || session.user.id !== expectedUserId) {
    throw new Error("Mobile session jijjiirameera. Page kana irra deebi'ii bani.");
  }
  return { client, user };
}

function finiteAmount(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeServerTrip(value: unknown): ServerTrip | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = row.status === "accepted" || row.status === "in_transit" ? row.status : null;
  const selectedPaymentMethod = row.selected_payment_method === "cash" || row.selected_payment_method === "bank_telebirr"
    ? row.selected_payment_method
    : null;
  if (typeof row.id !== "string" || !status || !selectedPaymentMethod) return null;
  return {
    id: row.id,
    status,
    priceEtb: finiteAmount(row.price_etb),
    selectedPaymentMethod,
  };
}

async function fetchServerTrip(
  client: SupabaseClient,
  userId: string,
  orderId: string,
): Promise<ServerTrip | null> {
  const { data, error } = await client
    .from("orders")
    .select("id,status,price_etb,selected_payment_method")
    .eq("id", orderId)
    .eq("driver_id", userId)
    .in("status", ["accepted", "in_transit"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeServerTrip(data);
}

async function fetchExistingProof(
  client: SupabaseClient,
  orderId: string,
): Promise<ExistingProof | null> {
  const { data, error } = await client
    .from("delivery_proofs")
    .select("id,photo_path,signature_path")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || typeof data.id !== "string" || typeof data.photo_path !== "string" || typeof data.signature_path !== "string") {
    return null;
  }
  return data as ExistingProof;
}

async function removeUploads(client: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await client.storage.from(DELIVERY_BUCKET).remove(paths);
  } catch {
    // Cleanup is best effort; the server transaction remains authoritative.
  }
}

function uniqueStamp(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${Date.now()}-${random}`;
}

export async function submitDriverDeliveryProof(
  input: SubmitDriverDeliveryProofInput,
): Promise<SubmitDriverDeliveryProofResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Delivery proof fi payment result offline keessatti hin ergamu. Connection deebi'ee booda irra deebi'i.");
  }

  const { client, user } = await requireExpectedDriver(input.expectedUserId);
  const existingBeforeUpload = await fetchExistingProof(client, input.orderId);
  if (existingBeforeUpload) {
    return { resultId: null, alreadyCompleted: true };
  }

  const trip = await fetchServerTrip(client, user.id, input.orderId);
  if (!trip) {
    throw new Error("Trip kun siif assigned miti, xumurameera, ykn active lifecycle keessaa ba'eera.");
  }

  const validated = validateDriverDeliveryProofDraft(input.draft, {
    orderStatus: trip.status,
    selectedPaymentMethod: trip.selectedPaymentMethod,
    tripAmountEtb: trip.priceEtb,
  });
  if (!validated.ok) throw new Error(validated.error);
  if (!input.draft.photo || !input.draft.signature) {
    throw new Error("Delivery photo fi signature barbaachisu.");
  }

  const stamp = uniqueStamp();
  const photoPath = `${input.orderId}/${stamp}-delivery.${deliveryPhotoExtension(input.draft.photo)}`;
  const signaturePath = `${input.orderId}/${stamp}-signature.png`;
  const uploaded: string[] = [];

  try {
    const photoUpload = await client.storage.from(DELIVERY_BUCKET).upload(
      photoPath,
      input.draft.photo,
      {
        contentType: input.draft.photo.type || "image/jpeg",
        upsert: false,
      },
    );
    if (photoUpload.error) throw new Error(photoUpload.error.message);
    uploaded.push(photoPath);

    const signatureUpload = await client.storage.from(DELIVERY_BUCKET).upload(
      signaturePath,
      input.draft.signature,
      {
        contentType: "image/png",
        upsert: false,
      },
    );
    if (signatureUpload.error) throw new Error(signatureUpload.error.message);
    uploaded.push(signaturePath);

    const { data, error } = await client.rpc("driver_finish_trip", {
      p_order_id: input.orderId,
      p_recipient_name: validated.recipientName,
      p_delivery_note: validated.deliveryNote || null,
      p_photo_path: photoPath,
      p_signature_path: signaturePath,
      p_result_type: validated.paymentResult,
      p_amount_collected: validated.amountCollected,
      p_payment_note: validated.paymentNote || null,
    });
    if (error) throw new Error(error.message);

    return {
      resultId: typeof data === "string" ? data : null,
      alreadyCompleted: false,
    };
  } catch (caught) {
    let proof: ExistingProof | null = null;
    try {
      proof = await fetchExistingProof(client, input.orderId);
    } catch {
      // Preserve the original submission error when reconciliation cannot run.
    }

    if (proof) {
      const ownPaths = uploaded.filter((path) => path !== proof?.photo_path && path !== proof?.signature_path);
      await removeUploads(client, ownPaths);
      return { resultId: null, alreadyCompleted: true };
    }

    await removeUploads(client, uploaded);
    throw caught;
  }
}
