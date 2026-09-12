import { supabase } from "./supabase.client";
import type { AdminOrder } from "./admin.service";
import type { AdminOrderPageSize } from "./admin-orders.service";

export const ADMIN_ORDER_CONTROL_QUEUES = ["delayed", "unassigned", "delayed-or-unassigned", "missing-evidence", "unreported-payment"] as const;
export type AdminOrderControlQueue = (typeof ADMIN_ORDER_CONTROL_QUEUES)[number];

export interface AdminOrderControlQueuePageOptions {
  queue: AdminOrderControlQueue;
  page: number;
  pageSize: AdminOrderPageSize;
  status?: string;
  search?: string;
  today?: boolean;
}

export interface AdminOrderControlQueuePageResult {
  queue: AdminOrderControlQueue;
  page: number;
  pageSize: AdminOrderPageSize;
  total: number;
  totalPages: number;
  invoiceTotal: number;
  statusCounts: Record<string, number>;
  orders: AdminOrder[];
}

type QueueRpcResult = { data: unknown; error: { message: string } | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePageSize(value: unknown): AdminOrderPageSize {
  return numberOf(value) === 50 ? 50 : 100;
}

function normalizeOrder(value: unknown): AdminOrder {
  const row = asRecord(value);
  return {
    id: String(row.id ?? ""),
    tracking_id: String(row.tracking_id ?? ""),
    customer_name: row.customer_name == null ? null : String(row.customer_name),
    customer_phone: row.customer_phone == null ? null : String(row.customer_phone),
    pickup_address: String(row.pickup_address ?? ""),
    dropoff_address: String(row.dropoff_address ?? ""),
    cargo_description: row.cargo_description == null ? null : String(row.cargo_description),
    vehicle_type: String(row.vehicle_type ?? ""),
    price_etb: row.price_etb == null ? null : numberOf(row.price_etb),
    status: String(row.status ?? ""),
    payment_status: String(row.payment_status ?? ""),
    driver_id: row.driver_id == null ? null : String(row.driver_id),
    truck_id: row.truck_id == null ? null : String(row.truck_id),
    driver_name: row.driver_name == null ? null : String(row.driver_name),
    plate_number: row.plate_number == null ? null : String(row.plate_number),
    assignment_label: String(row.assignment_label ?? "Driver and truck not assigned"),
    accepted_at: row.accepted_at == null ? null : String(row.accepted_at),
    delivered_at: row.delivered_at == null ? null : String(row.delivered_at),
    cancellation_reason: row.cancellation_reason == null ? null : String(row.cancellation_reason),
    cancellation_source: row.cancellation_source == null ? null : String(row.cancellation_source),
    cancelled_at: row.cancelled_at == null ? null : String(row.cancelled_at),
    created_at: String(row.created_at ?? ""),
  };
}

async function getQueueRpcResult(options: AdminOrderControlQueuePageOptions, page: number, pageSize: AdminOrderPageSize): Promise<QueueRpcResult> {
  if (options.queue === "unreported-payment") {
    const result = await supabase.rpc("admin_unreported_delivery_payment_page", {
      p_page: page,
      p_page_size: pageSize,
      p_search: options.search?.trim() || null,
      p_today: options.today === true,
    });
    return { data: result.data, error: result.error };
  }

  const result = await supabase.rpc("admin_order_control_queue_page", {
    p_queue: options.queue,
    p_page: page,
    p_page_size: pageSize,
    p_status: options.status?.trim() || "all",
    p_search: options.search?.trim() || null,
    p_today: options.today === true,
  });
  return { data: result.data, error: result.error };
}

export async function getAdminOrderControlQueuePage(options: AdminOrderControlQueuePageOptions): Promise<AdminOrderControlQueuePageResult> {
  const pageSize = normalizePageSize(options.pageSize);
  const page = Math.max(1, Math.trunc(numberOf(options.page) || 1));
  const { data, error } = await getQueueRpcResult(options, page, pageSize);
  if (error) throw new Error(error.message);

  const report = asRecord(data);
  const statusCountsRaw = asRecord(report.statusCounts);
  const statusCounts = Object.fromEntries(Object.entries(statusCountsRaw).map(([key, value]) => [key, numberOf(value)]));
  const rows = Array.isArray(report.rows) ? report.rows.map(normalizeOrder) : [];

  return {
    queue: ADMIN_ORDER_CONTROL_QUEUES.includes(report.queue as AdminOrderControlQueue) ? report.queue as AdminOrderControlQueue : options.queue,
    page: Math.max(1, numberOf(report.page) || 1),
    pageSize: normalizePageSize(report.pageSize),
    total: Math.max(0, numberOf(report.total)),
    totalPages: Math.max(1, numberOf(report.totalPages) || 1),
    invoiceTotal: Math.max(0, numberOf(report.invoiceTotal)),
    statusCounts,
    orders: rows,
  };
}
