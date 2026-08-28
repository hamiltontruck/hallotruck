export type DriverPaymentChoice = "cash" | "bank" | null;

export type DriverPaymentSubmissionIssue =
  | "method_required"
  | "transaction_required"
  | "evidence_required"
  | null;

export function getDriverPaymentSubmissionIssue(
  method: DriverPaymentChoice,
  providerReferenceOrLegacyEvidence: string | boolean,
): DriverPaymentSubmissionIssue {
  if (!method) return "method_required";

  // Preserve the previous boolean call shape for older callers while the
  // production Driver page now validates only the provider transaction ref.
  if (typeof providerReferenceOrLegacyEvidence === "boolean") {
    if (method === "bank" && !providerReferenceOrLegacyEvidence) return "evidence_required";
    return null;
  }

  if (method === "bank" && !providerReferenceOrLegacyEvidence.trim()) {
    return "transaction_required";
  }
  return null;
}
