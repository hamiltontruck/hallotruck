export type DriverPaymentChoice = "cash" | "bank" | null;

export type DriverPaymentSubmissionIssue = "method_required" | "evidence_required" | null;

export function getDriverPaymentSubmissionIssue(
  method: DriverPaymentChoice,
  hasBankEvidence: boolean,
): DriverPaymentSubmissionIssue {
  if (!method) return "method_required";
  if (method === "bank" && !hasBankEvidence) return "evidence_required";
  return null;
}
