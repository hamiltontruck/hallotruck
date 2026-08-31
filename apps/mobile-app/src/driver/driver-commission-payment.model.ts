export const DRIVER_COMMISSION_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const DRIVER_COMMISSION_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type DriverCommissionPaymentStatus = "pending" | "approved" | "rejected";

export type DriverCommissionPayment = {
  id: string;
  provider: string;
  transactionId: string;
  amountEtb: number;
  receiptPath: string;
  status: DriverCommissionPaymentStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type DriverCommissionReceiptLike = {
  name: string;
  size: number;
  type: string;
};

export type DriverCommissionPaymentDraft = {
  provider: string;
  transactionId: string;
  amountEtb: number;
  receipt: DriverCommissionReceiptLike | null;
};

export type ValidatedDriverCommissionPayment = {
  provider: string;
  transactionId: string;
  amountEtb: number;
  receipt: DriverCommissionReceiptLike;
};

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length ? text : null;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredText(value);
}

function requiredMoney(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function normalizeDriverCommissionPayment(value: unknown): DriverCommissionPayment | null {
  const row = recordOf(value);
  if (!row) return null;
  const id = requiredText(row.id);
  const provider = requiredText(row.provider);
  const transactionId = requiredText(row.transaction_id);
  const receiptPath = requiredText(row.receipt_path);
  const submittedAt = requiredText(row.submitted_at);
  const amountEtb = requiredMoney(row.amount_etb);
  const status = row.status === "pending" || row.status === "approved" || row.status === "rejected"
    ? row.status
    : null;
  if (!id || !provider || !transactionId || !receiptPath || !submittedAt || amountEtb === null || !status) return null;
  return {
    id,
    provider,
    transactionId,
    amountEtb,
    receiptPath,
    status,
    rejectionReason: optionalText(row.rejection_reason),
    submittedAt,
    reviewedAt: optionalText(row.reviewed_at),
  };
}

export function normalizeDriverCommissionPayments(value: unknown): DriverCommissionPayment[] {
  if (!Array.isArray(value)) throw new Error("Commission payment history returned an invalid response.");
  return value
    .map(normalizeDriverCommissionPayment)
    .filter((payment): payment is DriverCommissionPayment => payment !== null)
    .slice(0, 20);
}

export function validateDriverCommissionPayment(
  draft: DriverCommissionPaymentDraft,
  payableNowEtb: number,
): ValidatedDriverCommissionPayment {
  const provider = draft.provider.trim();
  const transactionId = draft.transactionId.trim();
  const amountEtb = Number(draft.amountEtb);
  const payable = Number(payableNowEtb);

  if (!provider) throw new Error("Bank ykn Telebirr provider filadhu.");
  if (provider.length > 80) throw new Error("Provider maqaan dheerina 80 caaluu hin qabu.");
  if (!transactionId) throw new Error("Transaction ID galchi.");
  if (transactionId.length > 120) throw new Error("Transaction ID dheerina 120 caaluu hin qabu.");
  if (!Number.isFinite(payable) || payable <= 0.005) {
    throw new Error("Komishinii amma kaffalamuu qabu hin jiru.");
  }
  if (!Number.isFinite(amountEtb) || amountEtb <= 0) {
    throw new Error("Amount sirrii galchi.");
  }
  if (amountEtb > payable + 0.005) {
    throw new Error("Amount kaffaltii amma hafee caaluu hin danda'u.");
  }
  if (!draft.receipt) throw new Error("Receipt suuraa ykn PDF filadhu.");
  if (!DRIVER_COMMISSION_RECEIPT_TYPES.includes(draft.receipt.type as typeof DRIVER_COMMISSION_RECEIPT_TYPES[number])) {
    throw new Error("Receipt JPG, PNG, WebP ykn PDF qofa ta'uu qaba.");
  }
  if (!Number.isFinite(draft.receipt.size) || draft.receipt.size <= 0) {
    throw new Error("Receipt file duwwaa ta'uu hin danda'u.");
  }
  if (draft.receipt.size > DRIVER_COMMISSION_RECEIPT_MAX_BYTES) {
    throw new Error("Receipt 10 MB caaluu hin qabu.");
  }

  return { provider, transactionId, amountEtb, receipt: draft.receipt };
}

export function safeDriverCommissionReceiptName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-90);
  return normalized || "receipt";
}

export function buildDriverCommissionReceiptPath(
  userId: string,
  fileName: string,
  timestamp: number,
  nonce: string,
): string {
  const owner = userId.trim();
  if (!owner || owner.includes("/")) throw new Error("Driver receipt owner path is invalid.");
  const safeNonce = nonce.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "upload";
  return `${owner}/${Math.max(0, Math.floor(timestamp))}-${safeNonce}-${safeDriverCommissionReceiptName(fileName)}`;
}

export function driverCommissionPaymentStatusLabel(status: DriverCommissionPaymentStatus): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending review";
}
