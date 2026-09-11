import { supabase } from "./supabase.client";

export interface AdminReportsSummary {
  totalOrders: number;
  deliveredOrders: number;
  activeShipments: number;
  waitingAssignment: number;
  totalTrucks: number;
  availableTrucks: number;
  assignedTrucks: number;
  totalDrivers: number;
  approvedDrivers: number;
  totalCustomers: number;
  releasedGrossEtb: number;
  refundedEtb: number;
  heldEscrowEtb: number;
  initiatedEtb: number;
  paymentsNeedingVerification: number;
}

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAdminReportsSummary(): Promise<AdminReportsSummary> {
  const { data, error } = await supabase.rpc("admin_reports_summary");
  if (error) throw new Error(error.message);

  const row = recordOf(data);
  return {
    totalOrders: numberOf(row.totalOrders),
    deliveredOrders: numberOf(row.deliveredOrders),
    activeShipments: numberOf(row.activeShipments),
    waitingAssignment: numberOf(row.waitingAssignment),
    totalTrucks: numberOf(row.totalTrucks),
    availableTrucks: numberOf(row.availableTrucks),
    assignedTrucks: numberOf(row.assignedTrucks),
    totalDrivers: numberOf(row.totalDrivers),
    approvedDrivers: numberOf(row.approvedDrivers),
    totalCustomers: numberOf(row.totalCustomers),
    releasedGrossEtb: numberOf(row.releasedGrossEtb),
    refundedEtb: numberOf(row.refundedEtb),
    heldEscrowEtb: numberOf(row.heldEscrowEtb),
    initiatedEtb: numberOf(row.initiatedEtb),
    paymentsNeedingVerification: numberOf(row.paymentsNeedingVerification),
  };
}
