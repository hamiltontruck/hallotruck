export const partnerSettlementStatuses = [
  "pending",
  "under_review",
  "approved",
  "partially_paid",
  "paid",
  "rejected",
  "reversed",
] as const;

export type PartnerSettlementStatus = (typeof partnerSettlementStatuses)[number];
export type PartnerSettlementPaymentMethod =
  | "bank_transfer"
  | "mobile_money"
  | "cash"
  | "cheque"
  | "other";

export type SettlementLike = {
  id: string;
  partner_id: string;
  project_id: string | null;
  settlement_reference: string;
  amount_etb: number | string;
  status: PartnerSettlementStatus;
  created_at: string;
  paid_at: string | null;
};

export type SettlementPaymentLike = {
  id: string;
  settlement_id: string;
  partner_id: string;
  amount_etb: number | string;
  payment_method: PartnerSettlementPaymentMethod;
  provider: string | null;
  transaction_ref: string;
  paid_at: string;
};

export type SettlementCorrectionLike = {
  id: string;
  partner_settlement_id: string | null;
  partner_earning_id: string | null;
  amount_etb: number | string;
  partner_net_reversal_etb: number | string;
  reason: string;
  created_at: string;
};

export type FreightEarningLike = {
  id: string;
  order_id: string;
  project_id: string | null;
  partner_net_etb: number | string;
  accrued_at: string;
};

export type PartnerSettlementProgress = {
  status: PartnerSettlementStatus;
  recordedPaidEtb: number;
  effectivePaidEtb: number;
  outstandingEtb: number;
  reversedEtb: number;
};

export type PartnerStatementEntryType =
  | "freight"
  | "freight_correction"
  | "settlement"
  | "settlement_reversal";

export type PartnerStatementRow = {
  id: string;
  occurredAt: string;
  entryType: PartnerStatementEntryType;
  projectId: string | null;
  reference: string;
  description: string;
  status: PartnerSettlementStatus | "accrued" | "corrected";
  creditEtb: number;
  debitEtb: number;
  balanceEtb: number;
  freightReference: string | null;
  settlementReference: string | null;
};

export type PartnerStatementFilters = {
  from: string;
  to: string;
  projectId: string;
  entryType: "all" | PartnerStatementEntryType;
  freight: string;
  settlementStatus: "all" | PartnerSettlementStatus;
};

const amount = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

export function getPartnerSettlementProgress(
  settlement: SettlementLike,
  payments: SettlementPaymentLike[],
  corrections: SettlementCorrectionLike[],
): PartnerSettlementProgress {
  const settlementPayments = payments.filter((item) => item.settlement_id === settlement.id);
  const recordedPaidEtb = settlementPayments.length > 0
    ? settlementPayments.reduce((sum, item) => sum + amount(item.amount_etb), 0)
    : settlement.status === "paid"
      ? amount(settlement.amount_etb)
      : 0;
  const reversedEtb = corrections
    .filter((item) => item.partner_settlement_id === settlement.id)
    .reduce((sum, item) => sum + amount(item.amount_etb), 0);
  const reversed = reversedEtb > 0 || settlement.status === "reversed";
  const effectivePaidEtb = Math.max(0, recordedPaidEtb - reversedEtb);
  return {
    status: reversed ? "reversed" : settlement.status,
    recordedPaidEtb,
    effectivePaidEtb,
    outstandingEtb: reversed
      ? 0
      : Math.max(0, amount(settlement.amount_etb) - recordedPaidEtb),
    reversedEtb,
  };
}

export function buildPartnerStatement(
  earnings: FreightEarningLike[],
  settlements: SettlementLike[],
  payments: SettlementPaymentLike[],
  corrections: SettlementCorrectionLike[],
): PartnerStatementRow[] {
  const rows: Omit<PartnerStatementRow, "balanceEtb">[] = [];

  for (const earning of earnings) {
    rows.push({
      id: `freight-${earning.id}`,
      occurredAt: earning.accrued_at,
      entryType: "freight",
      projectId: earning.project_id,
      reference: earning.order_id,
      description: "HALLO-generated freight earning",
      status: "accrued",
      creditEtb: amount(earning.partner_net_etb),
      debitEtb: 0,
      freightReference: earning.order_id,
      settlementReference: null,
    });
  }

  for (const correction of corrections) {
    const earning = earnings.find((item) => item.id === correction.partner_earning_id);
    if (earning && amount(correction.partner_net_reversal_etb) > 0) {
      rows.push({
        id: `freight-correction-${correction.id}`,
        occurredAt: correction.created_at,
        entryType: "freight_correction",
        projectId: earning.project_id,
        reference: earning.order_id,
        description: correction.reason,
        status: "corrected",
        creditEtb: 0,
        debitEtb: amount(correction.partner_net_reversal_etb),
        freightReference: earning.order_id,
        settlementReference: null,
      });
    }
  }

  for (const settlement of settlements) {
    const settlementPayments = payments.filter((item) => item.settlement_id === settlement.id);
    const progress = getPartnerSettlementProgress(settlement, payments, corrections);
    if (settlementPayments.length > 0) {
      for (const payment of settlementPayments) {
        rows.push({
          id: `settlement-payment-${payment.id}`,
          occurredAt: payment.paid_at,
          entryType: "settlement",
          projectId: settlement.project_id,
          reference: payment.transaction_ref,
          description: `${settlement.settlement_reference} · ${payment.payment_method.replaceAll("_", " ")}`,
          status: progress.status,
          creditEtb: 0,
          debitEtb: amount(payment.amount_etb),
          freightReference: null,
          settlementReference: settlement.settlement_reference,
        });
      }
    } else if (settlement.status === "paid") {
      rows.push({
        id: `legacy-settlement-${settlement.id}`,
        occurredAt: settlement.paid_at ?? settlement.created_at,
        entryType: "settlement",
        projectId: settlement.project_id,
        reference: settlement.settlement_reference,
        description: `${settlement.settlement_reference} · legacy paid settlement`,
        status: progress.status,
        creditEtb: 0,
        debitEtb: amount(settlement.amount_etb),
        freightReference: null,
        settlementReference: settlement.settlement_reference,
      });
    }

    for (const correction of corrections.filter((item) => item.partner_settlement_id === settlement.id)) {
      rows.push({
        id: `settlement-reversal-${correction.id}`,
        occurredAt: correction.created_at,
        entryType: "settlement_reversal",
        projectId: settlement.project_id,
        reference: settlement.settlement_reference,
        description: correction.reason,
        status: "reversed",
        creditEtb: amount(correction.amount_etb),
        debitEtb: 0,
        freightReference: null,
        settlementReference: settlement.settlement_reference,
      });
    }
  }

  let balance = 0;
  return rows
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
    .map((row) => {
      balance = Math.round((balance + row.creditEtb - row.debitEtb) * 100) / 100;
      return { ...row, balanceEtb: balance };
    });
}

export function filterPartnerStatement(
  rows: PartnerStatementRow[],
  filters: PartnerStatementFilters,
) {
  // Statement timestamps are stored as UTC. Parsing an unqualified date in
  // the browser's local zone can silently exclude rows around midnight.
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`).getTime() : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`).getTime() : null;
  const freight = filters.freight.trim().toLowerCase();

  return rows.filter((row) => {
    const occurredAt = new Date(row.occurredAt).getTime();
    if (from !== null && occurredAt < from) return false;
    if (to !== null && occurredAt > to) return false;
    if (filters.projectId && row.projectId !== filters.projectId) return false;
    if (filters.entryType !== "all" && row.entryType !== filters.entryType) return false;
    if (freight) {
      if (!row.freightReference?.toLowerCase().includes(freight)) return false;
    }
    if (filters.settlementStatus !== "all") {
      if (!row.settlementReference || row.status !== filters.settlementStatus) return false;
    }
    return true;
  });
}
