import { AdminReportsPanel } from "../components/admin/AdminReportsPanel";
import type { AdminReportsSummary } from "../services/admin-reports.service";

const emptySummary: AdminReportsSummary = {
  totalOrders: 0,
  deliveredOrders: 0,
  activeShipments: 0,
  waitingAssignment: 0,
  totalTrucks: 0,
  availableTrucks: 0,
  assignedTrucks: 0,
  totalDrivers: 0,
  approvedDrivers: 0,
  totalCustomers: 0,
  releasedGrossEtb: 0,
  refundedEtb: 0,
  heldEscrowEtb: 0,
  initiatedEtb: 0,
  paymentsNeedingVerification: 0,
};

export function AdminReports() {
  return <AdminReportsPanel fallback={emptySummary} />;
}
