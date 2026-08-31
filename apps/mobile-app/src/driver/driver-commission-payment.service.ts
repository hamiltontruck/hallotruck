import type { SupabaseClient } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  buildDriverCommissionReceiptPath,
  normalizeDriverCommissionPayments,
  validateDriverCommissionPayment,
  type DriverCommissionPayment,
} from "./driver-commission-payment.model";

const RECEIPT_BUCKET = "driver-commission-receipts";

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<SupabaseClient> {
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
    throw new Error("Mobile session jijjiirameera. Wallet irra deebi'ii bani.");
  }
  return client;
}

export async function fetchDriverCommissionPayments(expectedUserId: string): Promise<DriverCommissionPayment[]> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_commission_payments")
    .select("id,provider,transaction_id,amount_etb,receipt_path,status,rejection_reason,submitted_at,reviewed_at")
    .eq("driver_id", expectedUserId)
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return normalizeDriverCommissionPayments(data ?? []);
}

function uploadNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function submitDriverCommissionPayment(input: {
  expectedUserId: string;
  provider: string;
  transactionId: string;
  amountEtb: number;
  payableNowEtb: number;
  receipt: File | null;
}): Promise<string> {
  const validated = validateDriverCommissionPayment({
    provider: input.provider,
    transactionId: input.transactionId,
    amountEtb: input.amountEtb,
    receipt: input.receipt,
  }, input.payableNowEtb);
  const client = await requireExpectedDriver(input.expectedUserId);
  const receipt = input.receipt as File;
  const path = buildDriverCommissionReceiptPath(
    input.expectedUserId,
    receipt.name,
    Date.now(),
    uploadNonce(),
  );

  const upload = await client.storage.from(RECEIPT_BUCKET).upload(path, receipt, {
    cacheControl: "3600",
    contentType: receipt.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const { data, error } = await client.rpc("submit_driver_commission_payment", {
    p_provider: validated.provider,
    p_transaction_id: validated.transactionId,
    p_amount_etb: validated.amountEtb,
    p_receipt_path: path,
  });

  if (error) {
    // Storage cleanup is best effort. The private bucket has no broad delete permission,
    // so a failed cleanup must never hide the authoritative RPC error.
    await client.storage.from(RECEIPT_BUCKET).remove([path]).catch(() => undefined);
    throw new Error(error.message);
  }
  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Commission payment galmaa'eera, garuu confirmation ID hin deebiine.");
  }
  return data;
}
