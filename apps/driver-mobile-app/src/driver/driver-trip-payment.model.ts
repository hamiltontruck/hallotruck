export type DriverPaymentEvent = "initiated" | "held_escrow" | "released";
export type DriverPaymentConfirmationType = "payment_confirmed" | "payment_not_received" | null;

export type DriverTripPaymentStatus = {
  paymentId: string;
  provider: string;
  providerRef: string | null;
  amountEtb: number;
  paymentEvent: DriverPaymentEvent;
  confirmationType: DriverPaymentConfirmationType;
  confirmationReason: string | null;
  confirmedAt: string | null;
  releasedAt: string | null;
  orderStatus: string;
  canConfirm: boolean;
  canReportNotReceived: boolean;
};

export type DriverAssignedCustomerContact = {
  customerName: string;
  customerPhone: string | null;
};

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value);
}

function nonNegativeMoney(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function normalizeDriverTripPaymentStatus(value: unknown): DriverTripPaymentStatus | null {
  const row = recordOf(value);
  if (!row) return null;
  const paymentId = requiredText(row.payment_id);
  const provider = requiredText(row.provider);
  const amountEtb = nonNegativeMoney(row.amount_etb);
  const paymentEvent = row.payment_event === "initiated" || row.payment_event === "held_escrow" || row.payment_event === "released"
    ? row.payment_event
    : null;
  const confirmationType = row.confirmation_type === null || row.confirmation_type === undefined
    ? null
    : row.confirmation_type === "payment_confirmed" || row.confirmation_type === "payment_not_received"
      ? row.confirmation_type
      : undefined;
  const orderStatus = requiredText(row.order_status);
  if (!paymentId || !provider || amountEtb === null || !paymentEvent || confirmationType === undefined || !orderStatus) return null;
  if (typeof row.can_confirm !== "boolean" || typeof row.can_report_not_received !== "boolean") return null;
  return {
    paymentId,
    provider,
    providerRef: optionalText(row.provider_ref),
    amountEtb,
    paymentEvent,
    confirmationType,
    confirmationReason: optionalText(row.confirmation_reason),
    confirmedAt: optionalText(row.confirmed_at),
    releasedAt: optionalText(row.released_at),
    orderStatus,
    canConfirm: row.can_confirm,
    canReportNotReceived: row.can_report_not_received,
  };
}

export function normalizeDriverTripPaymentStatuses(value: unknown): DriverTripPaymentStatus[] {
  if (!Array.isArray(value)) throw new Error("Driver payment status returned an invalid response.");
  return value.map(normalizeDriverTripPaymentStatus).filter((row): row is DriverTripPaymentStatus => row !== null);
}

export function normalizeAssignedCustomerContact(value: unknown): DriverAssignedCustomerContact {
  const raw = Array.isArray(value) ? value[0] : value;
  const row = recordOf(raw);
  const customerName = requiredText(row?.customer_name);
  if (!row || !customerName) throw new Error("Assigned customer contact is unavailable for this order.");
  return { customerName, customerPhone: optionalText(row.customer_phone) };
}

export function driverPaymentEventLabel(event: DriverPaymentEvent): string {
  if (event === "released") return "Released";
  if (event === "held_escrow") return "Held in escrow";
  return "Initiated";
}

export function driverPaymentConfirmationLabel(value: DriverPaymentConfirmationType): string {
  if (value === "payment_confirmed") return "Driver confirmed";
  if (value === "payment_not_received") return "Reported not received";
  return "Awaiting Driver action";
}
