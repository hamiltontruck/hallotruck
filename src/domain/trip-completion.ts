export type TripPaymentState =
  | "cancelled"
  | "delivery_pending"
  | "payment_required"
  | "awaiting_admin_review"
  | "awaiting_driver_confirmation"
  | "released"
  | "refunded"
  | "payment_open";

export interface TripCompletionSummary {
  order_id: string;
  tracking_id: string;
  order_status: string;
  payment_terms: string;
  invoice_total_etb: number;
  initiated_etb: number;
  held_escrow_etb: number;
  released_etb: number;
  refunded_etb: number;
  verified_net_etb: number;
  balance_due_etb: number;
  commission_charged_etb: number;
  payment_state: TripPaymentState;
  delivery_proof_recorded: boolean;
  rating_score: number | null;
}

export type CompletionStepState = "complete" | "current" | "waiting" | "attention";

export interface CompletionStep {
  key: "delivery" | "payment" | "commission" | "rating";
  state: CompletionStepState;
}

export function getDriverPostDeliveryRoute(_paymentTerms: string, orderId: string) {
  return `/driver/payment/${orderId}`;
}

export function buildTripCompletionSteps(
  summary: TripCompletionSummary,
  audience: "customer" | "driver",
): CompletionStep[] {
  const delivered = summary.order_status === "delivered" && summary.delivery_proof_recorded;
  const paymentComplete = summary.payment_state === "released" && summary.balance_due_etb === 0;
  const paymentNeedsAttention = summary.payment_state === "payment_required"
    || summary.payment_state === "refunded"
    || summary.payment_state === "payment_open";

  const steps: CompletionStep[] = [
    { key: "delivery", state: delivered ? "complete" : "current" },
    {
      key: "payment",
      state: paymentComplete
        ? "complete"
        : paymentNeedsAttention
          ? "attention"
          : delivered ? "current" : "waiting",
    },
  ];

  if (audience === "driver") {
    steps.push({
      key: "commission",
      state: paymentComplete && summary.commission_charged_etb > 0
        ? "complete"
        : delivered ? "current" : "waiting",
    });
  }

  steps.push({
    key: "rating",
    state: summary.rating_score !== null
      ? "complete"
      : paymentComplete ? "current" : "waiting",
  });

  return steps;
}
