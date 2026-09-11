import { supabase } from "./supabase.client";
import type { FinanceRange } from "../domain/finance-dashboard";

export const FINANCE_V3_PAGE_SIZES = [50, 100] as const;

export type FinanceV3KpiKey = "released" | "escrow" | "pending" | "refunds" | "failed" | "commission" | "deposits" | "wallets";

export type FinanceV3Summary = {
  todayRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  releasedPayments: number;
  heldEscrow: number;
  pendingReviews: number;
  refundedPayments: number;
  failedPayments: number;
  commissionEarned: number;
  commissionPaid: number;
  outstandingCommission: number;
  driverDeposits: number;
  availableDriverDeposits: number;
  netPlatformRevenue: number;
  activeWallets: number;
};

export type FinanceV3TrendRow = { date: string; revenue: number; escrow: number; commission: number };
export type FinanceV3BreakdownRow = { label: string; value: number };
export type FinanceV3DrillRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  created_at: string;
  reviewed_at: string | null;
  tracking_id: string;
  customer_name: string | null;
  driver_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
};

export type FinanceV3Report = {
  summary: FinanceV3Summary;
  trend: FinanceV3TrendRow[];
  breakdowns: {
    providers: FinanceV3BreakdownRow[];
    routes: FinanceV3BreakdownRow[];
    drivers: FinanceV3BreakdownRow[];
    customers: FinanceV3BreakdownRow[];
    trucks: FinanceV3BreakdownRow[];
  };
  signals: { highValue: number; oldEscrow: number; refunds: number; failed: number; depositMismatch: boolean };
  providers: string[];
  drilldown: { page: number; pageSize: number; total: number; totalPages: number; rows: FinanceV3DrillRow[] };
};

export type FinanceV3Query = {
  range: FinanceRange;
  provider?: string;
  driver?: string;
  customer?: string;
  route?: string;
  truck?: string;
  search?: string;
  activeKpi?: FinanceV3KpiKey | null;
  page?: number;
  pageSize?: number;
};

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rows(value: unknown): FinanceV3BreakdownRow[] {
  return Array.isArray(value) ? value.map((item) => ({ label: String(item?.label ?? "Unknown"), value: numberOf(item?.value) })) : [];
}

function eventForKpi(kpi?: FinanceV3KpiKey | null) {
  if (kpi === "released") return "released";
  if (kpi === "escrow") return "held_escrow";
  if (kpi === "pending") return "initiated";
  if (kpi === "refunds") return "refunded";
  if (kpi === "failed") return "failed";
  return null;
}

export async function getAdminFinanceV3Report(query: FinanceV3Query): Promise<FinanceV3Report> {
  const pageSize = query.pageSize === 100 ? 100 : 50;
  const { data, error } = await supabase.rpc("admin_finance_v3_report", {
    p_range: query.range,
    p_provider: query.provider && query.provider !== "all" ? query.provider : null,
    p_driver_query: query.driver?.trim() || null,
    p_customer_query: query.customer?.trim() || null,
    p_route_query: query.route?.trim() || null,
    p_truck_query: query.truck?.trim() || null,
    p_search: query.search?.trim() || null,
    p_event: eventForKpi(query.activeKpi),
    p_page: Math.max(1, query.page ?? 1),
    p_page_size: pageSize,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, any>;
  const summary = raw.summary ?? {};
  const drilldown = raw.drilldown ?? {};
  return {
    summary: {
      todayRevenue: numberOf(summary.todayRevenue), weeklyRevenue: numberOf(summary.weeklyRevenue), monthlyRevenue: numberOf(summary.monthlyRevenue),
      releasedPayments: numberOf(summary.releasedPayments), heldEscrow: numberOf(summary.heldEscrow), pendingReviews: numberOf(summary.pendingReviews),
      refundedPayments: numberOf(summary.refundedPayments), failedPayments: numberOf(summary.failedPayments), commissionEarned: numberOf(summary.commissionEarned),
      commissionPaid: numberOf(summary.commissionPaid), outstandingCommission: numberOf(summary.outstandingCommission), driverDeposits: numberOf(summary.driverDeposits),
      availableDriverDeposits: numberOf(summary.availableDriverDeposits), netPlatformRevenue: numberOf(summary.netPlatformRevenue), activeWallets: numberOf(summary.activeWallets),
    },
    trend: Array.isArray(raw.trend) ? raw.trend.map((item: any) => ({ date: String(item.date), revenue: numberOf(item.revenue), escrow: numberOf(item.escrow), commission: numberOf(item.commission) })) : [],
    breakdowns: {
      providers: rows(raw.breakdowns?.providers), routes: rows(raw.breakdowns?.routes), drivers: rows(raw.breakdowns?.drivers),
      customers: rows(raw.breakdowns?.customers), trucks: rows(raw.breakdowns?.trucks),
    },
    signals: {
      highValue: numberOf(raw.signals?.highValue), oldEscrow: numberOf(raw.signals?.oldEscrow), refunds: numberOf(raw.signals?.refunds),
      failed: numberOf(raw.signals?.failed), depositMismatch: Boolean(raw.signals?.depositMismatch),
    },
    providers: Array.isArray(raw.providers) ? raw.providers.map(String) : [],
    drilldown: {
      page: Math.max(1, numberOf(drilldown.page)), pageSize: drilldown.pageSize === 100 ? 100 : 50,
      total: numberOf(drilldown.total), totalPages: Math.max(1, numberOf(drilldown.totalPages)),
      rows: Array.isArray(drilldown.rows) ? drilldown.rows.map((item: any) => ({
        id: String(item.id), order_id: String(item.order_id), provider: String(item.provider ?? ""), provider_ref: item.provider_ref ? String(item.provider_ref) : null,
        amount_etb: numberOf(item.amount_etb), event: String(item.event ?? ""), created_at: String(item.created_at), reviewed_at: item.reviewed_at ? String(item.reviewed_at) : null,
        tracking_id: String(item.tracking_id ?? item.order_id), customer_name: item.customer_name ? String(item.customer_name) : null,
        driver_name: item.driver_name ? String(item.driver_name) : null, pickup_address: String(item.pickup_address ?? ""),
        dropoff_address: String(item.dropoff_address ?? ""), vehicle_type: String(item.vehicle_type ?? ""),
      })) : [],
    },
  };
}
