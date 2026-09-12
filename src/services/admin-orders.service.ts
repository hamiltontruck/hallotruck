import { supabase } from "./supabase.client";
import type { AdminOrder } from "./admin.service";

export const ADMIN_ORDER_PAGE_SIZES = [50, 100] as const;
export const ADMIN_ORDER_STATUSES = ["all", "quoted", "placed", "accepted", "in_transit", "delivered", "cancelled"] as const;

export type AdminOrderPageSize = (typeof ADMIN_ORDER_PAGE_SIZES)[number];
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export interface AdminOrderPageOptions {
  page: number;
  pageSize: AdminOrderPageSize;
  status?: string;
  search?: string;
  today?: boolean;
}

export interface AdminOrderPageResult {
  orders: AdminOrder[];
  total: number;
  page: number;
  pageSize: AdminOrderPageSize;
  totalPages: number;
  statusCounts: Record<string, number>;
}

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

export async function getAdminOrdersPage(options: AdminOrderPageOptions): Promise<AdminOrderPageResult> {
  const pageSize = normalizePageSize(options.pageSize);
  const page = Math.max(1, Math.trunc(numberOf(options.page) || 1));
  const status = options.status && ADMIN_ORDER_STATUSES.includes(options.status as AdminOrderStatus)
    ? options.status
    : "all";
  const search = options.search?.trim().slice(0, 120) || null;

  const { data, error } = await supabase.rpc("admin_orders_page", {
    p_page: page,
    p_page_size: pageSize,
    p_status: status,
    p_search: search,
    p_today: options.today === true,
  });
  if (error) throw new Error(error.message);

  const report = asRecord(data);
  const rows = Array.isArray(report.rows) ? report.rows.map(normalizeOrder) : [];
  const rawStatusCounts = asRecord(report.statusCounts);
  const statusCounts = Object.fromEntries(
    ADMIN_ORDER_STATUSES.map((key) => [key, Math.max(0, numberOf(rawStatusCounts[key]))]),
  );

  return {
    orders: rows,
    total: Math.max(0, numberOf(report.total)),
    page: Math.max(1, numberOf(report.page) || 1),
    pageSize: normalizePageSize(report.pageSize),
    totalPages: Math.max(1, numberOf(report.totalPages) || 1),
    statusCounts,
  };
}
