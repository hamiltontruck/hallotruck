export type DriverFinancialSummary = {
  completedTrips: number;
  grossReleasedEtb: number;
  commissionChargedEtb: number;
  commissionPaidEtb: number;
  adminDepositEtb: number;
  availableDepositEtb: number;
  commissionDueEtb: number;
};

export type DriverCommissionSummary = {
  balanceEtb: number;
  chargedEtb: number;
  approvedPaidEtb: number;
  pendingEtb: number;
  blocked: boolean;
};

export type DriverWalletTrip = {
  id: string;
  orderId: string;
  trackingId: string;
  pickupAddress: string;
  dropoffAddress: string;
  resultType: "cash_received" | "bank_telebirr" | "payment_not_received";
  paymentMethod: "cash" | "bank_telebirr" | "none";
  amountCollectedEtb: number;
  grossEtb: number;
  commissionEtb: number;
  netEtb: number;
  depositConsumedEtb: number;
  commissionDueAfterEtb: number;
  completedAt: string;
};

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function rowOf(value: unknown): UnknownRecord | null {
  if (Array.isArray(value)) return recordOf(value[0]);
  return recordOf(value);
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function requiredMoney(value: unknown, field: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Driver wallet returned an invalid ${field} value.`);
  }
  return amount;
}

function requiredCount(value: unknown, field: string): number {
  const count = requiredMoney(value, field);
  if (!Number.isInteger(count)) throw new Error(`Driver wallet returned an invalid ${field} count.`);
  return count;
}

export function normalizeDriverFinancialSummary(value: unknown): DriverFinancialSummary {
  const row = rowOf(value);
  if (!row) throw new Error("Driver financial summary is unavailable.");
  return {
    completedTrips: requiredCount(row.completed_trips, "completed_trips"),
    grossReleasedEtb: requiredMoney(row.gross_released_etb, "gross_released_etb"),
    commissionChargedEtb: requiredMoney(row.commission_charged_etb, "commission_charged_etb"),
    commissionPaidEtb: requiredMoney(row.commission_paid_etb, "commission_paid_etb"),
    adminDepositEtb: requiredMoney(row.admin_deposit_etb, "admin_deposit_etb"),
    availableDepositEtb: requiredMoney(row.available_deposit_etb, "available_deposit_etb"),
    commissionDueEtb: requiredMoney(row.commission_due_etb, "commission_due_etb"),
  };
}

export function normalizeDriverCommissionSummary(value: unknown): DriverCommissionSummary {
  const row = rowOf(value);
  if (!row) throw new Error("Driver commission summary is unavailable.");
  if (typeof row.blocked !== "boolean") throw new Error("Driver commission summary returned an invalid blocked value.");
  return {
    balanceEtb: requiredMoney(row.balance_etb, "balance_etb"),
    chargedEtb: requiredMoney(row.charged_etb, "charged_etb"),
    approvedPaidEtb: requiredMoney(row.approved_paid_etb, "approved_paid_etb"),
    pendingEtb: requiredMoney(row.pending_etb, "pending_etb"),
    blocked: row.blocked,
  };
}

export function normalizeDriverWalletTrip(value: unknown): DriverWalletTrip | null {
  const row = recordOf(value);
  if (!row) return null;
  const orderValue = Array.isArray(row.orders) ? row.orders[0] : row.orders;
  const order = recordOf(orderValue);
  const id = requiredText(row.id);
  const orderId = requiredText(row.order_id);
  const trackingId = requiredText(order?.tracking_id);
  const pickupAddress = requiredText(order?.pickup_address);
  const dropoffAddress = requiredText(order?.dropoff_address);
  const completedAt = requiredText(row.completed_at);
  const resultType = row.result_type === "cash_received"
    || row.result_type === "bank_telebirr"
    || row.result_type === "payment_not_received"
    ? row.result_type
    : null;
  const paymentMethod = row.payment_method === "cash"
    || row.payment_method === "bank_telebirr"
    || row.payment_method === "none"
    ? row.payment_method
    : null;
  if (!id || !orderId || !trackingId || !pickupAddress || !dropoffAddress || !completedAt || !resultType || !paymentMethod) return null;

  try {
    return {
      id,
      orderId,
      trackingId,
      pickupAddress,
      dropoffAddress,
      resultType,
      paymentMethod,
      amountCollectedEtb: requiredMoney(row.amount_collected, "amount_collected"),
      grossEtb: requiredMoney(row.driver_gross_etb, "driver_gross_etb"),
      commissionEtb: requiredMoney(row.commission_etb, "commission_etb"),
      netEtb: requiredMoney(row.driver_net_etb, "driver_net_etb"),
      depositConsumedEtb: requiredMoney(row.deposit_consumed_etb, "deposit_consumed_etb"),
      commissionDueAfterEtb: requiredMoney(row.commission_due_after_etb, "commission_due_after_etb"),
      completedAt,
    };
  } catch {
    return null;
  }
}

export function normalizeDriverWalletTrips(value: unknown): DriverWalletTrip[] {
  if (!Array.isArray(value)) throw new Error("Driver trip history returned an invalid response.");
  return value
    .map(normalizeDriverWalletTrip)
    .filter((trip): trip is DriverWalletTrip => trip !== null)
    .slice(0, 20);
}

export function formatWalletEtb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `ETB ${Math.round(value).toLocaleString()}`;
}

export function walletResultLabel(result: DriverWalletTrip["resultType"]): string {
  if (result === "cash_received") return "Cash received";
  if (result === "bank_telebirr") return "Bank / Telebirr";
  return "Payment outstanding";
}
