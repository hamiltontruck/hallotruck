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

export const ADMIN_REPORT_RANGES = ["today", "7d", "30d", "90d", "all"] as const;
export const ADMIN_REPORT_STATUSES = ["all", "quoted", "placed", "accepted", "in_transit", "delivered", "cancelled"] as const;
export const ADMIN_REPORT_PAGE_SIZES = [50, 100] as const;

export type AdminReportRange = (typeof ADMIN_REPORT_RANGES)[number];
export type AdminReportStatus = (typeof ADMIN_REPORT_STATUSES)[number];

export type AdminReportBreakdownRow = {
  label: string;
  phone?: string | null;
  orders: number;
  delivered: number;
  invoiceEtb: number;
};

export type AdminReportOrderRow = {
  id: string;
  trackingId: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  priceEtb: number;
  status: string;
  paymentStatus: string;
  driverId: string | null;
  truckId: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

export type AdminReportsV2 = {
  range: AdminReportRange;
  generatedAt: string;
  filters: { status: AdminReportStatus; customer: string; route: string };
  summary: AdminReportsSummary & { invoiceEtb: number };
  statusCounts: Record<string, number>;
  topRoutes: AdminReportBreakdownRow[];
  topCustomers: AdminReportBreakdownRow[];
  page: {
    page: number;
    pageSize: 50 | 100;
    total: number;
    totalPages: number;
    rows: AdminReportOrderRow[];
  };
};

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function arrayOf(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function reportSummaryOf(value: unknown): AdminReportsV2["summary"] {
  const row = recordOf(value);
  return {
    totalOrders: numberOf(row.totalOrders),
    deliveredOrders: numberOf(row.deliveredOrders),
    activeShipments: numberOf(row.activeShipments),
    waitingAssignment: numberOf(row.waitingAssignment),
    invoiceEtb: numberOf(row.invoiceEtb),
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

function normalizeBreakdown(value: unknown, labelKey: "route" | "customer"): AdminReportBreakdownRow[] {
  return arrayOf(value).map((item) => {
    const row = recordOf(item);
    return {
      label: String(row[labelKey] ?? "Unknown"),
      phone: row.phone == null ? null : String(row.phone),
      orders: numberOf(row.orders),
      delivered: numberOf(row.delivered),
      invoiceEtb: numberOf(row.invoice_etb),
    };
  });
}

function normalizeV2(value: unknown): AdminReportsV2 {
  const root = recordOf(value);
  const filters = recordOf(root.filters);
  const page = recordOf(root.page);
  const statusCountsRaw = recordOf(root.statusCounts);
  const statusCounts: Record<string, number> = {};
  for (const [status, count] of Object.entries(statusCountsRaw)) statusCounts[status] = numberOf(count);

  return {
    range: ADMIN_REPORT_RANGES.includes(root.range as AdminReportRange) ? root.range as AdminReportRange : "30d",
    generatedAt: String(root.generatedAt ?? ""),
    filters: {
      status: ADMIN_REPORT_STATUSES.includes(filters.status as AdminReportStatus) ? filters.status as AdminReportStatus : "all",
      customer: String(filters.customer ?? ""),
      route: String(filters.route ?? ""),
    },
    summary: reportSummaryOf(root.summary),
    statusCounts,
    topRoutes: normalizeBreakdown(root.topRoutes, "route"),
    topCustomers: normalizeBreakdown(root.topCustomers, "customer"),
    page: {
      page: Math.max(1, numberOf(page.page) || 1),
      pageSize: numberOf(page.pageSize) === 100 ? 100 : 50,
      total: numberOf(page.total),
      totalPages: Math.max(1, numberOf(page.totalPages) || 1),
      rows: arrayOf(page.rows).map((item) => {
        const row = recordOf(item);
        return {
          id: String(row.id ?? ""),
          trackingId: String(row.tracking_id ?? ""),
          customerName: row.customer_name == null ? null : String(row.customer_name),
          customerPhone: row.customer_phone == null ? null : String(row.customer_phone),
          pickupAddress: String(row.pickup_address ?? ""),
          dropoffAddress: String(row.dropoff_address ?? ""),
          vehicleType: String(row.vehicle_type ?? ""),
          priceEtb: numberOf(row.price_etb),
          status: String(row.status ?? ""),
          paymentStatus: String(row.payment_status ?? ""),
          driverId: row.driver_id == null ? null : String(row.driver_id),
          truckId: row.truck_id == null ? null : String(row.truck_id),
          createdAt: String(row.created_at ?? ""),
          deliveredAt: row.delivered_at == null ? null : String(row.delivered_at),
        };
      }),
    },
  };
}

export async function getAdminReportsSummary(): Promise<AdminReportsSummary> {
  const { data, error } = await supabase.rpc("admin_reports_summary");
  if (error) throw new Error(error.message);
  return reportSummaryOf(data);
}

export async function getAdminReportsV2(input: {
  range?: AdminReportRange;
  status?: AdminReportStatus;
  customer?: string;
  route?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminReportsV2> {
  const range = ADMIN_REPORT_RANGES.includes(input.range as AdminReportRange) ? input.range as AdminReportRange : "30d";
  const status = ADMIN_REPORT_STATUSES.includes(input.status as AdminReportStatus) ? input.status as AdminReportStatus : "all";
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = input.pageSize === 100 ? 100 : 50;
  const { data, error } = await supabase.rpc("admin_reports_v2", {
    p_range: range,
    p_status: status === "all" ? null : status,
    p_customer: input.customer?.trim() || null,
    p_route: input.route?.trim() || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw new Error(error.message);
  return normalizeV2(data);
}
