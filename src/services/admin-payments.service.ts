import { supabase } from "./supabase.client";
import type { AdminOrder, Driver, Payment } from "./admin.service";

export const ADMIN_PAYMENT_PAGE_SIZES = [50, 100] as const;
export const ADMIN_PAYMENT_EVENTS = ["all", "initiated", "held_escrow", "released", "refunded", "failed"] as const;

export type AdminPaymentEvent = (typeof ADMIN_PAYMENT_EVENTS)[number];

export type AdminPaymentLedgerItem = {
  payment: Payment;
  order: AdminOrder | null;
  driver: Driver | null;
};

export type AdminPaymentLedgerSummary = {
  releasedGross: number;
  refunded: number;
  releasedNet: number;
  heldEscrow: number;
  initiated: number;
  paymentCount: number;
  deliveryProofCount: number;
};

export type AdminPaymentLedgerPage = {
  items: AdminPaymentLedgerItem[];
  page: number;
  pageSize: 50 | 100;
  total: number;
  totalPages: number;
  allCount: number;
  statusCounts: Record<string, number>;
  summary: AdminPaymentLedgerSummary;
};

type LedgerRpcRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number | string;
  event: string;
  receipt_path: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  tracking_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  price_etb: number | string | null;
  order_status: string | null;
  payment_status: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
};

type LedgerRpcResult = {
  rows: LedgerRpcRow[] | null;
  total_count: number | string;
  all_count: number | string;
  status_counts: Record<string, number | string> | null;
};

type FinanceSummaryRow = {
  released_total_etb: number | string;
  refunded_total_etb: number | string;
  held_total_etb: number | string;
  initiated_total_etb: number | string;
  payment_count: number | string;
  delivery_proof_count: number | string;
};

const ORDER_COLUMNS = "id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,cargo_description,vehicle_type,price_etb,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,cancellation_reason,cancellation_source,cancelled_at,created_at";

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePageSize(value: number): 50 | 100 {
  return value === 50 ? 50 : 100;
}

function normalizeStatusCounts(value: Record<string, number | string> | null | undefined, allCount: number) {
  const counts: Record<string, number> = { all: allCount };
  for (const [key, count] of Object.entries(value ?? {})) counts[key] = asNumber(count);
  return counts;
}

async function loadLedgerRpc(page: number, pageSize: 50 | 100, event: AdminPaymentEvent, search: string) {
  const { data, error } = await supabase.rpc("admin_payment_ledger_page", {
    p_page: page,
    p_page_size: pageSize,
    p_event: event === "all" ? null : event,
    p_search: search.trim() || null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] ?? null) as LedgerRpcResult | null;
}

export async function getAdminPaymentLedgerPage(input: {
  page?: number;
  pageSize?: number;
  event?: string;
  search?: string;
}): Promise<AdminPaymentLedgerPage> {
  const requestedPage = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = normalizePageSize(input.pageSize ?? 100);
  const event = ADMIN_PAYMENT_EVENTS.includes(input.event as AdminPaymentEvent)
    ? input.event as AdminPaymentEvent
    : "all";
  const search = input.search ?? "";

  let rpcRow = await loadLedgerRpc(requestedPage, pageSize, event, search);
  const firstTotal = asNumber(rpcRow?.total_count);
  const totalPages = Math.max(1, Math.ceil(firstTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) rpcRow = await loadLedgerRpc(page, pageSize, event, search);

  const rows = rpcRow?.rows ?? [];
  const orderIds = [...new Set(rows.map((row) => row.order_id).filter(Boolean))];
  const ordersResult = orderIds.length
    ? await supabase.from("orders").select(ORDER_COLUMNS).in("id", orderIds)
    : { data: [], error: null };
  if (ordersResult.error) throw new Error(ordersResult.error.message);

  const rowByOrderId = new Map(rows.map((row) => [row.order_id, row]));
  const orders = new Map<string, AdminOrder>();
  for (const raw of (ordersResult.data ?? []) as Omit<AdminOrder, "driver_name" | "plate_number" | "assignment_label">[]) {
    const ledgerRow = rowByOrderId.get(raw.id);
    const driverName = ledgerRow?.driver_name?.trim() || ledgerRow?.driver_phone?.trim() || null;
    orders.set(raw.id, {
      ...raw,
      driver_name: driverName,
      plate_number: null,
      assignment_label: driverName ?? (raw.driver_id ? "Assigned driver" : "Unassigned"),
    });
  }

  const items = rows.map((row): AdminPaymentLedgerItem => ({
    payment: {
      id: row.id,
      order_id: row.order_id,
      provider: row.provider,
      provider_ref: row.provider_ref,
      amount_etb: asNumber(row.amount_etb),
      event: row.event,
      receipt_path: row.receipt_path,
      raw_payload: row.raw_payload,
      created_at: row.created_at,
    },
    order: orders.get(row.order_id) ?? null,
    driver: row.driver_id ? {
      id: row.driver_id,
      full_name: row.driver_name,
      phone: row.driver_phone,
      driver_status: null,
    } : null,
  }));

  const { data: summaryData, error: summaryError } = await supabase.rpc("admin_finance_dashboard_summary");
  if (summaryError) throw new Error(summaryError.message);
  const summaryRow = ((summaryData ?? [])[0] ?? null) as FinanceSummaryRow | null;
  const releasedGross = asNumber(summaryRow?.released_total_etb);
  const refunded = asNumber(summaryRow?.refunded_total_etb);
  const allCount = asNumber(rpcRow?.all_count);
  const total = asNumber(rpcRow?.total_count);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    allCount,
    statusCounts: normalizeStatusCounts(rpcRow?.status_counts, allCount),
    summary: {
      releasedGross,
      refunded,
      releasedNet: Math.max(0, releasedGross - refunded),
      heldEscrow: asNumber(summaryRow?.held_total_etb),
      initiated: asNumber(summaryRow?.initiated_total_etb),
      paymentCount: asNumber(summaryRow?.payment_count),
      deliveryProofCount: asNumber(summaryRow?.delivery_proof_count),
    },
  };
}

export async function getAdminOrderFinancialDetails(orderId: string) {
  const [paymentsResult, proofResult] = await Promise.all([
    supabase
      .from("payments")
      .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,raw_payload,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("delivery_proofs")
      .select("id,order_id,recipient_name,delivery_note,photo_path,signature_path,delivered_at")
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);
  const error = paymentsResult.error || proofResult.error;
  if (error) throw new Error(error.message);
  return {
    payments: (paymentsResult.data ?? []) as Payment[],
    proof: proofResult.data ?? null,
  };
}
