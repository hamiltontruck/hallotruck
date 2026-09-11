import { supabase } from "./supabase.client";

export interface ControlOrder {
  id: string;
  tracking_id: string;
  customer_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  payment_status: string;
  driver_id: string | null;
  truck_id: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ControlPayment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  receipt_path: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface ControlTruck {
  id: string;
  plate_number: string;
  status: string;
}

export interface ControlDriver {
  id: string;
  full_name: string | null;
  driver_status: string | null;
}

export interface ControlCustomer {
  id: string;
  created_at: string;
}

export interface ControlProof {
  id: string;
  order_id: string;
}

export interface ControlDocument {
  id: string;
  driver_id: string;
  document_key: string;
  status: string;
  expiry_date: string | null;
}

export interface ControlDriverFinancialSummary {
  driver_id: string;
  completed_trips: number | string;
  gross_released_etb: number | string;
  commission_charged_etb: number | string;
  commission_paid_etb: number | string;
  admin_deposit_etb: number | string;
  available_deposit_etb: number | string;
  commission_due_etb: number | string;
}

export interface ControlCenterServerSummary {
  todayRevenue: number;
  totalOrders: number;
  todayOrders: number;
  activeTrips: number;
  deliveredToday: number;
  delayedTrips: number;
  unassignedOrders: number;
  availableTrucks: number;
  totalTrucks: number;
  activeDrivers: number;
  totalDrivers: number;
  newCustomersToday: number;
  pendingPayments: number;
  missingEvidence: number;
  legacyCompleted: number;
  commissionReceivable: number;
  totalDriverDeposit: number;
  availableDriverDeposit: number;
  complianceDocumentAlerts: number;
  driverOnboardingAlerts: number;
  maintenanceAlerts: number;
  releasedAmount: number;
  escrowAmount: number;
  refundedAmount: number;
  failedPayments: number;
  failedOrRefundedPayments: number;
  canonicalPayments: number;
}

export interface ControlCenterData {
  orders: ControlOrder[];
  payments: ControlPayment[];
  trucks: ControlTruck[];
  drivers: ControlDriver[];
  customers: ControlCustomer[];
  proofs: ControlProof[];
  documents: ControlDocument[];
  driverFinancialSummaries?: ControlDriverFinancialSummary[];
  warnings?: string[];
  serverSummary?: ControlCenterServerSummary;
}

type UnknownRecord = Record<string, unknown>;

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordOf(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function rowsOf(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(recordOf) : [];
}

function orderOf(value: unknown): ControlOrder {
  const row = recordOf(value);
  return {
    id: String(row.id ?? ""),
    tracking_id: String(row.tracking_id ?? ""),
    customer_name: row.customer_name == null ? null : String(row.customer_name),
    pickup_address: String(row.pickup_address ?? ""),
    dropoff_address: String(row.dropoff_address ?? ""),
    status: String(row.status ?? ""),
    payment_status: String(row.payment_status ?? ""),
    driver_id: row.driver_id == null ? null : String(row.driver_id),
    truck_id: row.truck_id == null ? null : String(row.truck_id),
    accepted_at: row.accepted_at == null ? null : String(row.accepted_at),
    delivered_at: row.delivered_at == null ? null : String(row.delivered_at),
    created_at: String(row.created_at ?? ""),
  };
}

function paymentOf(value: unknown): ControlPayment {
  const row = recordOf(value);
  return {
    id: String(row.id ?? ""),
    order_id: String(row.order_id ?? ""),
    provider: String(row.provider ?? ""),
    provider_ref: row.provider_ref == null ? null : String(row.provider_ref),
    amount_etb: numberOf(row.amount_etb),
    event: String(row.event ?? ""),
    receipt_path: row.receipt_path == null ? null : String(row.receipt_path),
    raw_payload: row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
      ? row.raw_payload as Record<string, unknown>
      : null,
    created_at: String(row.created_at ?? ""),
  };
}

function truckOf(value: unknown): ControlTruck {
  const row = recordOf(value);
  return {
    id: String(row.id ?? ""),
    plate_number: String(row.plate_number ?? ""),
    status: String(row.status ?? ""),
  };
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function serverSummaryOf(value: unknown): ControlCenterServerSummary {
  const row = recordOf(value);
  return {
    todayRevenue: numberOf(row.todayRevenue),
    totalOrders: numberOf(row.totalOrders),
    todayOrders: numberOf(row.todayOrders),
    activeTrips: numberOf(row.activeTrips),
    deliveredToday: numberOf(row.deliveredToday),
    delayedTrips: numberOf(row.delayedTrips),
    unassignedOrders: numberOf(row.unassignedOrders),
    availableTrucks: numberOf(row.availableTrucks),
    totalTrucks: numberOf(row.totalTrucks),
    activeDrivers: numberOf(row.activeDrivers),
    totalDrivers: numberOf(row.totalDrivers),
    newCustomersToday: numberOf(row.newCustomersToday),
    pendingPayments: numberOf(row.pendingPayments),
    missingEvidence: numberOf(row.missingEvidence),
    legacyCompleted: numberOf(row.legacyCompleted),
    commissionReceivable: numberOf(row.commissionReceivable),
    totalDriverDeposit: numberOf(row.totalDriverDeposit),
    availableDriverDeposit: numberOf(row.availableDriverDeposit),
    complianceDocumentAlerts: numberOf(row.complianceDocumentAlerts),
    driverOnboardingAlerts: numberOf(row.driverOnboardingAlerts),
    maintenanceAlerts: numberOf(row.maintenanceAlerts),
    releasedAmount: numberOf(row.releasedAmount),
    escrowAmount: numberOf(row.escrowAmount),
    refundedAmount: numberOf(row.refundedAmount),
    failedPayments: numberOf(row.failedPayments),
    failedOrRefundedPayments: numberOf(row.failedOrRefundedPayments),
    canonicalPayments: numberOf(row.canonicalPayments),
  };
}

export async function getControlCenterData(): Promise<ControlCenterData> {
  // The former per-driver "Driver finance unavailable" fallback is intentionally gone:
  // this single report succeeds with exact set-based finance totals or fails as one unit.
  const { data, error } = await supabase.rpc("admin_control_center_v2_report");
  if (error) throw new Error(error.message);

  const report = recordOf(data);
  const queues = recordOf(report.queues);
  const delayedOrUnassigned = rowsOf(queues.delayedOrUnassigned).map(orderOf);
  const missingEvidence = rowsOf(queues.missingEvidence).map(orderOf);
  const pendingPayments = rowsOf(queues.pendingPayments).map(paymentOf);
  const legacyPayments = rowsOf(queues.legacyPayments).map(paymentOf);
  const failedOrRefundedPayments = rowsOf(queues.failedOrRefundedPayments).map(paymentOf);
  const maintenanceTrucks = rowsOf(queues.maintenanceTrucks).map(truckOf);

  return {
    // The live CEO page needs only six-row action previews. Exact totals and
    // finance values come from serverSummary, so none of these arrays grows
    // with the production tables.
    orders: dedupeById([...delayedOrUnassigned, ...missingEvidence]),
    payments: dedupeById([...pendingPayments, ...legacyPayments, ...failedOrRefundedPayments]),
    trucks: maintenanceTrucks,
    drivers: [],
    customers: [],
    proofs: [],
    documents: [],
    driverFinancialSummaries: [],
    warnings: [],
    serverSummary: serverSummaryOf(report.summary),
  };
}
