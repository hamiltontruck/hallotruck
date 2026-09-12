import { supabase } from "./supabase.client";
import type { AdminReportRange } from "../domain/admin-intelligence";

export type AdminIntelligenceSearchOrder = {
  id: string; tracking_id: string; customer_name: string | null; customer_phone: string | null;
  pickup_address: string; dropoff_address: string; cargo_description: string | null; vehicle_type: string;
  price_etb: number | null; status: string; payment_status: string; driver_id: string | null; truck_id: string | null;
  created_at: string;
};
export type AdminIntelligenceSearchCustomer = {
  id: string; full_name: string; phone: string; email: string | null; company_name: string | null;
  is_credit_customer: boolean; created_at: string;
};
export type AdminIntelligenceSearchDriver = { id: string; full_name: string | null; phone: string | null; driver_status: string | null };
export type AdminIntelligenceSearchTruck = {
  id: string; plate_number: string; vehicle_type: string; capacity_tons: number | null; status: string; created_at: string;
};
export type AdminIntelligenceSearchPayment = {
  id: string; order_id: string; provider: string; provider_ref: string | null; amount_etb: number; event: string;
  created_at: string; tracking_id: string | null; customer_name: string | null; customer_phone: string | null;
  pickup_address: string | null; dropoff_address: string | null; driver_id: string | null; driver_name: string | null; driver_phone: string | null;
};

export type AdminIntelligenceV2 = {
  range: AdminReportRange;
  generatedAt: string;
  coverage: { orders: number; customers: number; drivers: number; trucks: number; payments: number };
  report: {
    orderCount: number; deliveredCount: number; cancelledCount: number; activeCount: number; unassignedCount: number;
    invoiceEtb: number; averageOrderEtb: number; completionRate: number; released: number; refunded: number; netRevenue: number;
    pendingCount: number; pendingEtb: number; heldCount: number; escrowEtb: number; customerCount: number; totalCustomers: number;
    approvedDrivers: number; availableTrucks: number; fleetUtilization: number; attentionCount: number;
    topRoutes: Array<{ route: string; orders: number; delivered: number; invoice_etb: number }>;
    statusBreakdown: Array<{ status: string; count: number }>;
    providerBreakdown: Array<{ provider: string; records: number; amount_etb: number }>;
    revenueTrend: Array<{ date: string; amountEtb: number }>;
  };
  search: {
    query: string; limit: number; offset: number; total: number;
    counts: { orders: number; customers: number; drivers: number; trucks: number; payments: number };
    rows: {
      orders: AdminIntelligenceSearchOrder[];
      customers: AdminIntelligenceSearchCustomer[];
      drivers: AdminIntelligenceSearchDriver[];
      trucks: AdminIntelligenceSearchTruck[];
      payments: AdminIntelligenceSearchPayment[];
    };
  };
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(raw: unknown): AdminIntelligenceV2 {
  const value = (raw ?? {}) as Record<string, any>;
  const coverage = value.coverage ?? {};
  const report = value.report ?? {};
  const search = value.search ?? {};
  const counts = search.counts ?? {};
  const rows = search.rows ?? {};
  return {
    range: (value.range ?? "30d") as AdminReportRange,
    generatedAt: String(value.generatedAt ?? ""),
    coverage: { orders:n(coverage.orders), customers:n(coverage.customers), drivers:n(coverage.drivers), trucks:n(coverage.trucks), payments:n(coverage.payments) },
    report: {
      orderCount:n(report.orderCount), deliveredCount:n(report.deliveredCount), cancelledCount:n(report.cancelledCount), activeCount:n(report.activeCount), unassignedCount:n(report.unassignedCount),
      invoiceEtb:n(report.invoiceEtb), averageOrderEtb:n(report.averageOrderEtb), completionRate:n(report.completionRate), released:n(report.released), refunded:n(report.refunded), netRevenue:n(report.netRevenue),
      pendingCount:n(report.pendingCount), pendingEtb:n(report.pendingEtb), heldCount:n(report.heldCount), escrowEtb:n(report.escrowEtb), customerCount:n(report.customerCount), totalCustomers:n(report.totalCustomers),
      approvedDrivers:n(report.approvedDrivers), availableTrucks:n(report.availableTrucks), fleetUtilization:n(report.fleetUtilization), attentionCount:n(report.attentionCount),
      topRoutes:Array.isArray(report.topRoutes) ? report.topRoutes.map((x:any)=>({...x,orders:n(x.orders),delivered:n(x.delivered),invoice_etb:n(x.invoice_etb)})) : [],
      statusBreakdown:Array.isArray(report.statusBreakdown) ? report.statusBreakdown.map((x:any)=>({...x,count:n(x.count)})) : [],
      providerBreakdown:Array.isArray(report.providerBreakdown) ? report.providerBreakdown.map((x:any)=>({...x,records:n(x.records),amount_etb:n(x.amount_etb)})) : [],
      revenueTrend:Array.isArray(report.revenueTrend) ? report.revenueTrend.map((x:any)=>({date:String(x.date),amountEtb:n(x.amountEtb)})) : [],
    },
    search: {
      query:String(search.query ?? ""), limit:n(search.limit)||6, offset:n(search.offset), total:n(search.total),
      counts:{orders:n(counts.orders),customers:n(counts.customers),drivers:n(counts.drivers),trucks:n(counts.trucks),payments:n(counts.payments)},
      rows:{orders:rows.orders ?? [],customers:rows.customers ?? [],drivers:rows.drivers ?? [],trucks:rows.trucks ?? [],payments:rows.payments ?? []},
    },
  };
}

export async function getAdminIntelligenceV2(input: { range: AdminReportRange; query?: string; searchPage?: number; searchLimit?: number }) {
  const limit = Math.min(50, Math.max(1, input.searchLimit ?? 6));
  const page = Math.max(1, input.searchPage ?? 1);
  const { data, error } = await supabase.rpc("admin_intelligence_v2", {
    p_range: input.range,
    p_query: input.query?.trim() ?? "",
    p_search_limit: limit,
    p_search_offset: (page - 1) * limit,
  });
  if (error) throw new Error(error.message);
  return normalize(data);
}
