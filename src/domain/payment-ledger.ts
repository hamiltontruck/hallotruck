export type PaymentLedgerStatusFilter = "pending" | "rejected" | "escrow" | "released" | "refunded" | "all";
export type PaymentLedgerDateFilter = "all" | "today" | "7d" | "30d";
export type PaymentLedgerEvent = "initiated" | "failed" | "held_escrow" | "released" | "refunded";

export interface PaymentLedgerSearchRecord {
  provider: string;
  transactionId?: string | null;
  trackingId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}

export interface PaymentLedgerIndicators {
  invoiceMismatch: boolean;
  overpaymentEtb: number;
  underpaymentEtb: number;
  missingReceipt: boolean;
}

const PAYMENT_TOLERANCE_ETB = 0.005;

function finiteAmount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function matchesPaymentLedgerSearch(record: PaymentLedgerSearchRecord, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const searchable = [
    record.trackingId,
    record.customerName,
    record.customerPhone,
    record.driverName,
    record.driverPhone,
    record.pickupAddress,
    record.dropoffAddress,
    record.transactionId,
    record.provider,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();

  return searchable.includes(normalizedQuery);
}

export function matchesPaymentLedgerStatus(event: PaymentLedgerEvent, filter: PaymentLedgerStatusFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return event === "initiated";
  if (filter === "rejected") return event === "failed";
  if (filter === "escrow") return event === "held_escrow";
  if (filter === "refunded") return event === "refunded";
  return event === "released";
}

export function matchesPaymentLedgerDate(value: string, filter: PaymentLedgerDateFilter, now = new Date()) {
  if (filter === "all") return true;

  const created = new Date(value);
  if (!Number.isFinite(created.getTime())) return false;

  if (filter === "today") {
    return created.getFullYear() === now.getFullYear()
      && created.getMonth() === now.getMonth()
      && created.getDate() === now.getDate();
  }

  const age = now.getTime() - created.getTime();
  const days = filter === "7d" ? 7 : 30;
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}

export function isLegacyCompletedLedgerPayment(event: PaymentLedgerEvent, legacyCompleted: boolean | undefined) {
  return event === "released" && legacyCompleted === true;
}

export function getPaymentLedgerIndicators({
  invoiceTotal,
  paymentAmount,
  hasOrder,
  hasReceipt,
  evidenceRequired,
}: {
  invoiceTotal: number | string | null | undefined;
  paymentAmount: number | string | null | undefined;
  hasOrder: boolean;
  hasReceipt: boolean;
  evidenceRequired: boolean;
}): PaymentLedgerIndicators {
  const invoice = finiteAmount(invoiceTotal);
  const paid = finiteAmount(paymentAmount);
  const difference = hasOrder ? paid - invoice : 0;
  const invoiceMismatch = hasOrder && Math.abs(difference) > PAYMENT_TOLERANCE_ETB;

  return {
    invoiceMismatch,
    overpaymentEtb: invoiceMismatch && difference > 0 ? difference : 0,
    underpaymentEtb: invoiceMismatch && difference < 0 ? Math.abs(difference) : 0,
    missingReceipt: evidenceRequired && !hasReceipt,
  };
}

export function getPaymentLedgerPage(totalItems: number, requestedPage: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(Math.max(0, totalItems) / safePageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const startIndex = (page - 1) * safePageSize;
  return {
    page,
    pageCount,
    startIndex,
    endIndex: Math.min(startIndex + safePageSize, Math.max(0, totalItems)),
  };
}
