import { supabase } from "./supabase.client";

export const DELIVERY_RECONCILIATION_PAGE_SIZES = [50, 100] as const;
export type DeliveryReconciliationPageSize = (typeof DELIVERY_RECONCILIATION_PAGE_SIZES)[number];

export interface DeliveryReconciliationSummary {
  deliveredTotal: number;
  anomalyTotal: number;
  deliveredWithoutProof: number;
  deliveredWithoutTripPaymentResult: number;
  currentWithoutProof: number;
  currentWithoutTripPaymentResult: number;
  legitimateLegacy: number;
  currentWorkflowDefects: number;
}

export interface DeliveryReconciliationReportRow {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  delivered_at: string | null;
  hasProof: boolean;
  hasTripPaymentResult: boolean;
  missingProof: boolean;
  missingTripPaymentResult: boolean;
  currentWorkflowDefect: boolean;
  legitimateLegacy: boolean;
}

export interface DeliveryReconciliationReport {
  summary: DeliveryReconciliationSummary;
  page: number;
  pageSize: DeliveryReconciliationPageSize;
  total: number;
  totalPages: number;
  rows: DeliveryReconciliationReportRow[];
}

const EMPTY_SUMMARY: DeliveryReconciliationSummary = {
  deliveredTotal: 0,
  anomalyTotal: 0,
  deliveredWithoutProof: 0,
  deliveredWithoutTripPaymentResult: 0,
  currentWithoutProof: 0,
  currentWithoutTripPaymentResult: 0,
  legitimateLegacy: 0,
  currentWorkflowDefects: 0,
};

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizePageSize(value: unknown): DeliveryReconciliationPageSize {
  return numberOf(value) === 100 ? 100 : 50;
}

function normalizeRow(value: unknown): DeliveryReconciliationReportRow {
  const row = asRecord(value);
  return {
    id: String(row.id ?? ""),
    tracking_id: String(row.tracking_id ?? ""),
    pickup_address: String(row.pickup_address ?? ""),
    dropoff_address: String(row.dropoff_address ?? ""),
    delivered_at: row.delivered_at ? String(row.delivered_at) : null,
    hasProof: row.hasProof === true,
    hasTripPaymentResult: row.hasTripPaymentResult === true,
    missingProof: row.missingProof === true,
    missingTripPaymentResult: row.missingTripPaymentResult === true,
    currentWorkflowDefect: row.currentWorkflowDefect === true,
    legitimateLegacy: row.legitimateLegacy === true,
  };
}

export async function getAdminDeliveryReconciliationReport({
  page = 1,
  pageSize = 50,
}: {
  page?: number;
  pageSize?: DeliveryReconciliationPageSize;
} = {}): Promise<DeliveryReconciliationReport> {
  const { data, error } = await supabase.rpc("admin_delivery_reconciliation_report", {
    p_page: Math.max(1, Math.trunc(page)),
    p_page_size: normalizePageSize(pageSize),
  });
  if (error) throw error;

  const report = asRecord(data);
  const summary = asRecord(report.summary);
  const rows = Array.isArray(report.rows) ? report.rows.map(normalizeRow) : [];

  return {
    summary: {
      deliveredTotal: numberOf(summary.deliveredTotal),
      anomalyTotal: numberOf(summary.anomalyTotal),
      deliveredWithoutProof: numberOf(summary.deliveredWithoutProof),
      deliveredWithoutTripPaymentResult: numberOf(summary.deliveredWithoutTripPaymentResult),
      currentWithoutProof: numberOf(summary.currentWithoutProof),
      currentWithoutTripPaymentResult: numberOf(summary.currentWithoutTripPaymentResult),
      legitimateLegacy: numberOf(summary.legitimateLegacy),
      currentWorkflowDefects: numberOf(summary.currentWorkflowDefects),
    },
    page: Math.max(1, numberOf(report.page) || 1),
    pageSize: normalizePageSize(report.pageSize),
    total: Math.max(0, numberOf(report.total)),
    totalPages: Math.max(1, numberOf(report.totalPages) || 1),
    rows,
  };
}

export function emptyDeliveryReconciliationReport(): DeliveryReconciliationReport {
  return {
    summary: { ...EMPTY_SUMMARY },
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
    rows: [],
  };
}
