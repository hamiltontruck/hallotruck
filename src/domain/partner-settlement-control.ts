import {
  getPartnerSettlementProgress,
  type SettlementCorrectionLike,
  type SettlementLike,
  type SettlementPaymentLike,
} from "./partner-settlement";

export type PartnerSettlementControlSummary = {
  payableEtb: number;
  activeRequestEtb: number;
  pendingReviewCount: number;
  underReviewCount: number;
  payableSettlementCount: number;
  outstandingApprovedEtb: number;
  exceptionCount: number;
  nextAction: string;
};

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

export function buildPartnerSettlementControlSummary(
  settlements: SettlementLike[],
  payments: SettlementPaymentLike[],
  corrections: SettlementCorrectionLike[],
  payableEtb: number | string | null | undefined,
): PartnerSettlementControlSummary {
  const progress = settlements.map((settlement) => ({
    settlement,
    progress: getPartnerSettlementProgress(settlement, payments, corrections),
  }));

  const pendingReviewCount = progress.filter(({ progress: item }) => item.status === "pending").length;
  const underReviewCount = progress.filter(({ progress: item }) => item.status === "under_review").length;
  const payable = progress.filter(({ progress: item }) =>
    (item.status === "approved" || item.status === "partially_paid") && item.outstandingEtb > 0,
  );
  const payableSettlementCount = payable.length;
  const outstandingApprovedEtb = amount(
    payable.reduce((sum, { progress: item }) => sum + item.outstandingEtb, 0),
  );
  const activeRequestEtb = amount(
    progress
      .filter(({ progress: item }) => ["pending", "under_review", "approved", "partially_paid"].includes(item.status))
      .reduce((sum, { progress: item }) => sum + item.outstandingEtb, 0),
  );
  const exceptionCount = progress.filter(({ progress: item }) =>
    item.status === "rejected" || item.status === "reversed",
  ).length;
  const availablePayableEtb = amount(payableEtb);

  let nextAction = "No Partner settlement action is currently required.";
  if (underReviewCount > 0) {
    nextAction = `Approve or reject ${underReviewCount} settlement${underReviewCount === 1 ? "" : "s"}.`;
  } else if (pendingReviewCount > 0) {
    nextAction = `Start review for ${pendingReviewCount} settlement request${pendingReviewCount === 1 ? "" : "s"}.`;
  } else if (payableSettlementCount > 0) {
    nextAction = `Record payment for ${payableSettlementCount} approved settlement${payableSettlementCount === 1 ? "" : "s"}.`;
  } else if (availablePayableEtb > 0) {
    nextAction = "Create a pending settlement request from the available payable balance.";
  } else {
    nextAction = "Accrue eligible HALLO-generated freight before creating a settlement request.";
  }

  return {
    payableEtb: availablePayableEtb,
    activeRequestEtb,
    pendingReviewCount,
    underReviewCount,
    payableSettlementCount,
    outstandingApprovedEtb,
    exceptionCount,
    nextAction,
  };
}
