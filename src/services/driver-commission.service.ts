import { supabase } from "./supabase.client";

const BUCKET = "driver-commission-receipts";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type CommissionPaymentStatus = "pending" | "approved" | "rejected";

export interface DriverCommissionSummary {
  balanceEtb: number;
  chargedEtb: number;
  approvedPaidEtb: number;
  pendingEtb: number;
  blocked: boolean;
}

export interface DriverCommissionPayment {
  id: string;
  driver_id: string;
  provider: string;
  transaction_id: string;
  amount_etb: number;
  receipt_path: string;
  status: CommissionPaymentStatus;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface DriverCommissionCharge {
  id: string;
  driver_id: string;
  order_id: string;
  payment_id: string;
  gross_etb: number;
  commission_etb: number;
  status: "active" | "reversed";
  source: string;
  created_at: string;
}

export interface AdminCommissionPayment extends DriverCommissionPayment {
  driver_name?: string | null;
  driver_phone?: string | null;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function getMyCommissionSummary(): Promise<DriverCommissionSummary> {
  const { data, error } = await supabase.rpc("my_driver_commission_summary");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    balanceEtb: amount(row?.balance_etb),
    chargedEtb: amount(row?.charged_etb),
    approvedPaidEtb: amount(row?.approved_paid_etb),
    pendingEtb: amount(row?.pending_etb),
    blocked: Boolean(row?.blocked),
  };
}

export async function getMyCommissionPayments(): Promise<DriverCommissionPayment[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required.");
  const { data, error } = await supabase
    .from("driver_commission_payments")
    .select("id,driver_id,provider,transaction_id,amount_etb,receipt_path,status,rejection_reason,submitted_at,reviewed_at")
    .eq("driver_id", auth.user.id)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, amount_etb: amount(row.amount_etb) })) as DriverCommissionPayment[];
}

export async function getMyCommissionCharges(): Promise<DriverCommissionCharge[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required.");
  const { data, error } = await supabase
    .from("driver_commission_charges")
    .select("id,driver_id,order_id,payment_id,gross_etb,commission_etb,status,source,created_at")
    .eq("driver_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, gross_etb: amount(row.gross_etb), commission_etb: amount(row.commission_etb) })) as DriverCommissionCharge[];
}

function validateReceipt(file: File) {
  if (!ALLOWED.has(file.type)) throw new Error("Upload JPG, PNG, WebP or PDF only.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Receipt must be 10 MB or smaller.");
}

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80) || "receipt";
}

export async function submitCommissionPayment(input: {
  provider: string;
  transactionId: string;
  amountEtb: number;
  receipt: File;
}) {
  validateReceipt(input.receipt);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required.");
  const path = `${auth.user.id}/${Date.now()}-${safeName(input.receipt.name)}`;
  const upload = await supabase.storage.from(BUCKET).upload(path, input.receipt, {
    contentType: input.receipt.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);
  try {
    const { error } = await supabase.rpc("submit_driver_commission_payment", {
      p_provider: input.provider.trim(),
      p_transaction_id: input.transactionId.trim(),
      p_amount_etb: input.amountEtb,
      p_receipt_path: path,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export async function openCommissionReceipt(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export async function getAdminCommissionPayments(): Promise<AdminCommissionPayment[]> {
  const { data, error } = await supabase
    .from("driver_commission_payments")
    .select("id,driver_id,provider,transaction_id,amount_etb,receipt_path,status,rejection_reason,submitted_at,reviewed_at")
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DriverCommissionPayment[];
  const ids = [...new Set(rows.map((row) => row.driver_id))];
  const profiles = ids.length
    ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids)
    : { data: [], error: null };
  if (profiles.error) throw new Error(profiles.error.message);
  const byId = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    amount_etb: amount(row.amount_etb),
    driver_name: byId.get(row.driver_id)?.full_name ?? null,
    driver_phone: byId.get(row.driver_id)?.phone ?? null,
  }));
}

export async function reviewCommissionPayment(paymentId: string, approve: boolean, rejectionReason?: string) {
  const { error } = await supabase.rpc("admin_review_driver_commission_payment", {
    p_payment_id: paymentId,
    p_approve: approve,
    p_rejection_reason: rejectionReason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
