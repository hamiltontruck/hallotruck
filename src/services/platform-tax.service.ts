import { supabase } from "./supabase.client";

const BUCKET = "tax-remittance-receipts";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type PlatformTaxStatus = "due" | "partial" | "paid";

export type PlatformTaxSummary = {
  taxRatePercent: number;
  totalDueEtb: number;
  totalPaidEtb: number;
  totalOutstandingEtb: number;
  totalCreditEtb: number;
  dueCount: number;
  partialCount: number;
  paidCount: number;
};

export type PlatformTaxPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  taxRatePercent: number;
  commissionBaseSnapshotEtb: number;
  taxDueSnapshotEtb: number;
  currentCommissionBaseEtb: number;
  currentTaxDueEtb: number;
  paidEtb: number;
  outstandingEtb: number;
  creditEtb: number;
  status: PlatformTaxStatus;
  createdBy: string;
  createdAt: string;
};

export type PlatformTaxRemittance = {
  id: string;
  taxPeriodId: string;
  amountEtb: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
  receiptPath: string;
  note: string | null;
  paidBy: string;
  paidByName: string | null;
  createdAt: string;
};

export type PlatformTaxControl = {
  summary: PlatformTaxSummary;
  periods: PlatformTaxPeriod[];
  remittances: PlatformTaxRemittance[];
};

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-90) || "receipt";
}

function validateEvidence(file: File) {
  if (!ALLOWED.has(file.type)) throw new Error("Upload JPG, PNG, WebP or PDF evidence only.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Tax payment evidence must be 10 MB or smaller.");
}

export async function getPlatformTaxControl(): Promise<PlatformTaxControl> {
  const { data, error } = await supabase.rpc("admin_platform_tax_control");
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, any>;
  const summary = raw.summary ?? {};
  return {
    summary: {
      taxRatePercent: numberOf(summary.taxRatePercent) || 15,
      totalDueEtb: numberOf(summary.totalDueEtb),
      totalPaidEtb: numberOf(summary.totalPaidEtb),
      totalOutstandingEtb: numberOf(summary.totalOutstandingEtb),
      totalCreditEtb: numberOf(summary.totalCreditEtb),
      dueCount: numberOf(summary.dueCount),
      partialCount: numberOf(summary.partialCount),
      paidCount: numberOf(summary.paidCount),
    },
    periods: Array.isArray(raw.periods) ? raw.periods.map((row: any) => ({
      id: String(row.id),
      periodStart: String(row.periodStart),
      periodEnd: String(row.periodEnd),
      taxRatePercent: numberOf(row.taxRatePercent),
      commissionBaseSnapshotEtb: numberOf(row.commissionBaseSnapshotEtb),
      taxDueSnapshotEtb: numberOf(row.taxDueSnapshotEtb),
      currentCommissionBaseEtb: numberOf(row.currentCommissionBaseEtb),
      currentTaxDueEtb: numberOf(row.currentTaxDueEtb),
      paidEtb: numberOf(row.paidEtb),
      outstandingEtb: numberOf(row.outstandingEtb),
      creditEtb: numberOf(row.creditEtb),
      status: String(row.status) as PlatformTaxStatus,
      createdBy: String(row.createdBy),
      createdAt: String(row.createdAt),
    })) : [],
    remittances: Array.isArray(raw.remittances) ? raw.remittances.map((row: any) => ({
      id: String(row.id),
      taxPeriodId: String(row.taxPeriodId),
      amountEtb: numberOf(row.amountEtb),
      paymentDate: String(row.paymentDate),
      paymentMethod: String(row.paymentMethod ?? ""),
      reference: String(row.reference ?? ""),
      receiptPath: String(row.receiptPath ?? ""),
      note: row.note ? String(row.note) : null,
      paidBy: String(row.paidBy),
      paidByName: row.paidByName ? String(row.paidByName) : null,
      createdAt: String(row.createdAt),
    })) : [],
  };
}

export async function createPlatformTaxPeriod(periodStart: string, periodEnd: string) {
  const { data, error } = await supabase.rpc("admin_create_platform_tax_period", {
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function recordPlatformTaxRemittance(input: {
  taxPeriodId: string;
  amountEtb: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
  note?: string;
  evidence: File;
}) {
  validateEvidence(input.evidence);
  const requestKey = crypto.randomUUID();
  const receiptPath = `${input.taxPeriodId}/${requestKey}-${safeName(input.evidence.name)}`;
  const upload = await supabase.storage.from(BUCKET).upload(receiptPath, input.evidence, {
    contentType: input.evidence.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const { data, error } = await supabase.rpc("admin_record_platform_tax_remittance", {
    p_tax_period_id: input.taxPeriodId,
    p_amount_etb: input.amountEtb,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod.trim(),
    p_reference: input.reference.trim(),
    p_receipt_path: receiptPath,
    p_note: input.note?.trim() || null,
    p_request_key: requestKey,
  });
  if (error) {
    throw new Error(`${error.message} The uploaded evidence remains immutable and is not recorded as a remittance.`);
  }
  return String(data);
}

export async function openPlatformTaxReceipt(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
