export const DELIVERY_PROOF_REQUIRED_RELEASED_AT = "2026-08-16T18:17:11.000Z";
export const TRIP_PAYMENT_RESULT_REQUIRED_RELEASED_AT = "2026-08-28T18:15:40.000Z";

export type DeliveryReconciliationIndicator =
  | "delivered_without_proof"
  | "delivered_without_trip_payment_result"
  | "legitimate_legacy_delivered_record";

export type DeliveryReconciliationInput = {
  deliveredAt: string | null;
  hasProof: boolean;
  hasTripPaymentResult: boolean;
};

export type DeliveryReconciliationClassification = {
  indicators: DeliveryReconciliationIndicator[];
  currentWorkflowDefect: boolean;
  legitimateLegacy: boolean;
};

const proofBoundary = Date.parse(DELIVERY_PROOF_REQUIRED_RELEASED_AT);
const tripPaymentBoundary = Date.parse(TRIP_PAYMENT_RESULT_REQUIRED_RELEASED_AT);

export function classifyDeliveryReconciliation({
  deliveredAt,
  hasProof,
  hasTripPaymentResult,
}: DeliveryReconciliationInput): DeliveryReconciliationClassification {
  const deliveredTimestamp = deliveredAt ? Date.parse(deliveredAt) : Number.NaN;
  const hasKnownDeliveredAt = Number.isFinite(deliveredTimestamp);

  const missingProof = !hasProof;
  const missingTripPaymentResult = !hasTripPaymentResult;

  const proofGapIsLegacy = missingProof
    && hasKnownDeliveredAt
    && deliveredTimestamp < proofBoundary;
  const tripPaymentGapIsLegacy = missingTripPaymentResult
    && hasKnownDeliveredAt
    && deliveredTimestamp < tripPaymentBoundary;

  const proofGapIsCurrentDefect = missingProof && !proofGapIsLegacy;
  const tripPaymentGapIsCurrentDefect = missingTripPaymentResult && !tripPaymentGapIsLegacy;
  const currentWorkflowDefect = proofGapIsCurrentDefect || tripPaymentGapIsCurrentDefect;

  const hasMissingRecord = missingProof || missingTripPaymentResult;
  const legitimateLegacy = hasMissingRecord && !currentWorkflowDefect;

  const indicators: DeliveryReconciliationIndicator[] = [];
  if (missingProof) indicators.push("delivered_without_proof");
  if (missingTripPaymentResult) indicators.push("delivered_without_trip_payment_result");
  if (legitimateLegacy) indicators.push("legitimate_legacy_delivered_record");

  return { indicators, currentWorkflowDefect, legitimateLegacy };
}
