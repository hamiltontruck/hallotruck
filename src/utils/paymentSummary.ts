export interface PaymentLedgerEntry {
  amount_etb: number | string | null;
  event: string;
}

export interface PaymentSummary {
  invoiceTotal: number;
  initiated: number;
  heldEscrow: number;
  releasedGross: number;
  refunded: number;
  verifiedPaid: number;
  pendingVerification: number;
  committed: number;
  balanceToPay: number;
  remainingToSubmit: number;
  customerCredit: number;
}

function totalFor(entries: PaymentLedgerEntry[], event: string) {
  return entries
    .filter((entry) => entry.event === event)
    .reduce((sum, entry) => sum + Number(entry.amount_etb || 0), 0);
}

/**
 * Canonical financial summary used by Customer, Admin, Finance and invoices.
 *
 * - Every refunded ledger event reduces verified/committed money, regardless of provider.
 * - Initiated payments are pending verification, not verified paid.
 * - Balance to pay uses verified money only.
 * - Remaining to submit also reserves pending initiated money to prevent duplicates.
 */
export function calculatePaymentSummary(
  invoiceTotalInput: number | string | null | undefined,
  entries: PaymentLedgerEntry[],
): PaymentSummary {
  const invoiceTotal = Math.max(0, Number(invoiceTotalInput || 0));
  const initiated = totalFor(entries, "initiated");
  const heldEscrow = totalFor(entries, "held_escrow");
  const releasedGross = totalFor(entries, "released");
  const refunded = totalFor(entries, "refunded");

  const verifiedPaid = Math.max(0, releasedGross + heldEscrow - refunded);
  const pendingVerification = Math.max(0, initiated);
  const committed = Math.max(0, verifiedPaid + pendingVerification);

  return {
    invoiceTotal,
    initiated,
    heldEscrow,
    releasedGross,
    refunded,
    verifiedPaid,
    pendingVerification,
    committed,
    balanceToPay: Math.max(0, invoiceTotal - verifiedPaid),
    remainingToSubmit: Math.max(0, invoiceTotal - committed),
    customerCredit: Math.max(0, verifiedPaid - invoiceTotal),
  };
}
