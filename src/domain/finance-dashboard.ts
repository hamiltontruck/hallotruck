export type FinancePayment = {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number | string;
  event: "initiated" | "held_escrow" | "released" | "refunded" | "failed" | string;
  created_at: string;
  reviewed_at?: string | null;
};

export type FinanceOrder = {
  id: string;
  tracking_id: string;
  customer_id: string | null;
  customer_name: string | null;
  driver_id: string | null;
  truck_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  price_etb: number | string | null;
  status: string;
  payment_status: string;
  created_at: string;
};

export type FinanceProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
};

export type FinanceDeposit = {
  id: string;
  driver_id: string;
  amount_etb: number | string;
  status: string;
  created_at: string;
};

export type FinanceCommissionCharge = {
  id: string;
  driver_id: string;
  order_id: string;
  payment_id: string;
  commission_etb: number | string;
  status: string;
  created_at: string;
};

export type FinanceCommissionPayment = {
  id: string;
  driver_id: string;
  amount_etb: number | string;
  status: string;
  submitted_at: string;
};

export type FinanceConfirmation = {
  payment_id: string;
  order_id: string;
  driver_id: string;
  commission_etb: number | string;
  commission_reversed_at: string | null;
  commission_accrued_at: string;
};

export type FinanceCorrection = {
  id: string;
  source_payment_id: string | null;
  driver_commission_reversal_etb: number | string;
  amount_etb: number | string;
  correction_type: string;
  created_at: string;
};

export type FinanceDashboardData = {
  payments: FinancePayment[];
  orders: FinanceOrder[];
  profiles: FinanceProfile[];
  deposits: FinanceDeposit[];
  commissionCharges: FinanceCommissionCharge[];
  commissionPayments: FinanceCommissionPayment[];
  confirmations: FinanceConfirmation[];
  corrections: FinanceCorrection[];
};

export type FinanceRange = "today" | "7d" | "30d" | "90d" | "all";

export function numberOf(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rangeStart(range: FinanceRange, now = new Date()) {
  const start = new Date(now);
  if (range === "all") return null;
  if (range === "today") start.setHours(0, 0, 0, 0);
  if (range === "7d") start.setDate(start.getDate() - 6);
  if (range === "30d") start.setDate(start.getDate() - 29);
  if (range === "90d") start.setDate(start.getDate() - 89);
  return start;
}

export function inRange(value: string, range: FinanceRange, now = new Date()) {
  const start = rangeStart(range, now);
  return !start || new Date(value).getTime() >= start.getTime();
}

export function canonicalCommissionAccrued(data: FinanceDashboardData) {
  const byPayment = new Map<string, number>();
  for (const charge of data.commissionCharges) {
    if (charge.status !== "active") continue;
    byPayment.set(charge.payment_id, numberOf(charge.commission_etb));
  }
  for (const confirmation of data.confirmations) {
    if (confirmation.commission_reversed_at) byPayment.set(confirmation.payment_id, 0);
    else byPayment.set(confirmation.payment_id, numberOf(confirmation.commission_etb));
  }
  for (const correction of data.corrections) {
    if (!correction.source_payment_id) continue;
    const original = byPayment.get(correction.source_payment_id);
    if (original === undefined) continue;
    byPayment.set(
      correction.source_payment_id,
      Math.max(original - numberOf(correction.driver_commission_reversal_etb), 0),
    );
  }
  return [...byPayment.values()].reduce((sum, amount) => sum + amount, 0);
}

export function computeFinanceSummary(data: FinanceDashboardData, now = new Date()) {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const released = data.payments.filter((payment) => payment.event === "released");
  const sumSince = (start: Date) => released.filter((payment) => new Date(payment.created_at) >= start).reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const escrow = data.payments.filter((payment) => payment.event === "held_escrow").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const refunded = data.payments.filter((payment) => payment.event === "refunded").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const failed = data.payments.filter((payment) => payment.event === "failed").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const pendingReviews = data.payments.filter((payment) => payment.event === "initiated" && !payment.reviewed_at).length;
  const commissionEarned = canonicalCommissionAccrued(data);
  const commissionPaid = data.commissionPayments.filter((payment) => payment.status === "approved").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const outstandingCommission = Math.max(commissionEarned - commissionPaid, 0);
  const deposits = data.deposits.filter((deposit) => deposit.status === "active").reduce((sum, deposit) => sum + numberOf(deposit.amount_etb), 0);
  const availableDeposits = Math.max(deposits - outstandingCommission, 0);
  const activeWallets = new Set(data.deposits.filter((deposit) => deposit.status === "active").map((deposit) => deposit.driver_id)).size;
  const releasedTotal = released.reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  return {
    todayRevenue: sumSince(todayStart),
    weeklyRevenue: sumSince(weekStart),
    monthlyRevenue: sumSince(monthStart),
    releasedPayments: releasedTotal,
    heldEscrow: escrow,
    pendingReviews,
    refundedPayments: refunded,
    failedPayments: failed,
    commissionEarned,
    commissionPaid,
    outstandingCommission,
    driverDeposits: deposits,
    availableDriverDeposits: availableDeposits,
    netPlatformRevenue: Math.max(commissionEarned - refunded, 0),
    activeWallets,
  };
}

export function groupAmount<T>(rows: T[], keyOf: (row: T) => string, amountOf: (row: T) => number) {
  const grouped = new Map<string, number>();
  for (const row of rows) grouped.set(keyOf(row), (grouped.get(keyOf(row)) ?? 0) + amountOf(row));
  return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function dailySeries(payments: FinancePayment[], days = 14, now = new Date()) {
  const rows: { label: string; revenue: number; escrow: number; commission: number }[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now); day.setDate(day.getDate() - offset); day.setHours(0, 0, 0, 0);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const dayPayments = payments.filter((payment) => {
      const date = new Date(payment.created_at);
      return date >= day && date < next;
    });
    rows.push({
      label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue: dayPayments.filter((payment) => payment.event === "released").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0),
      escrow: dayPayments.filter((payment) => payment.event === "held_escrow").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0),
      commission: dayPayments.filter((payment) => payment.event === "released").reduce((sum, payment) => sum + numberOf(payment.amount_etb) * 0.02, 0),
    });
  }
  return rows;
}
