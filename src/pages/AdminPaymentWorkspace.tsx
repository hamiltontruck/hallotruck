import { AdminDeliveryReconciliationPanel } from "../components/admin/AdminDeliveryReconciliationPanel";
import { AdminPaymentLedgerAnomalyPanel } from "../components/admin/AdminPaymentLedgerAnomalyPanel";
import { AdminPaymentReview } from "./AdminPaymentReview";

export function AdminPaymentWorkspace() {
  return (
    <>
      <AdminPaymentLedgerAnomalyPanel />
      <AdminDeliveryReconciliationPanel />
      <AdminPaymentReview />
    </>
  );
}
