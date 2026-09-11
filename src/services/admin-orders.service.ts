import { supabase } from "./supabase.client";
import type { AdminOrder, Driver, Truck } from "./admin.service";

const ORDER_COLUMNS = "id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,cargo_description,vehicle_type,price_etb,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,cancellation_reason,cancellation_source,cancelled_at,created_at";
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

type RawAdminOrder = Omit<AdminOrder, "driver_name" | "plate_number" | "assignment_label">;

function normalizePage(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function safeSearchTerm(value: string) {
  return value.trim().replace(/[(),.%]/g, " ").replace(/\s+/g, " ").slice(0, 120);
}

function localDayBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function withFilters<T extends {
  eq: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lt: (column: string, value: string) => T;
  or: (filters: string) => T;
}>(query: T, options: AdminOrderPageOptions, statusOverride?: string) {
  const status = statusOverride ?? options.status;
  if (status && status !== "all" && ADMIN_ORDER_STATUSES.includes(status as AdminOrderStatus)) {
    query = query.eq("status", status);
  }
  if (options.today) {
    const { start, end } = localDayBounds();
    query = query.gte("created_at", start).lt("created_at", end);
  }
  const search = safeSearchTerm(options.search ?? "");
  if (search) {
    const pattern = `*${search}*`;
    query = query.or([
      `tracking_id.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `customer_phone.ilike.${pattern}`,
      `pickup_address.ilike.${pattern}`,
      `dropoff_address.ilike.${pattern}`,
      `vehicle_type.ilike.${pattern}`,
      `cargo_description.ilike.${pattern}`,
    ].join(","));
  }
  return query;
}

function decorateOrders(rows: RawAdminOrder[], drivers: Driver[], trucks: Truck[]) {
  const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));
  const truckMap = new Map(trucks.map((truck) => [truck.id, truck]));
  return rows.map((order) => {
    const driver = order.driver_id ? driverMap.get(order.driver_id) : undefined;
    const truck = order.truck_id ? truckMap.get(order.truck_id) : undefined;
    const driverName = driver?.full_name?.trim() || driver?.phone?.trim() || null;
    const plateNumber = truck?.plate_number?.trim() || null;
    return {
      ...order,
      driver_name: driverName,
      plate_number: plateNumber,
      assignment_label: driverName || plateNumber
        ? `${driverName ?? "Driver profile unavailable"} · ${plateNumber ?? "Plate unavailable"}`
        : "Driver and truck not assigned",
      cargo_description: order.cargo_description?.trim() || order.vehicle_type,
    } satisfies AdminOrder;
  });
}

export async function getAdminOrdersPage(
  options: AdminOrderPageOptions,
  drivers: Driver[],
  trucks: Truck[],
): Promise<AdminOrderPageResult> {
  const pageSize: AdminOrderPageSize = ADMIN_ORDER_PAGE_SIZES.includes(options.pageSize) ? options.pageSize : 100;
  const requestedPage = normalizePage(options.page);
  const from = (requestedPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let rowsQuery = supabase
    .from("orders")
    .select(ORDER_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  rowsQuery = withFilters(rowsQuery, { ...options, page: requestedPage, pageSize });
  const rowsPromise = rowsQuery.range(from, to);

  const countPromises = ADMIN_ORDER_STATUSES.filter((status) => status !== "all").map(async (status) => {
    let countQuery = supabase.from("orders").select("id", { count: "exact", head: true });
    countQuery = withFilters(countQuery, { ...options, status: "all", page: requestedPage, pageSize }, status);
    const { count, error } = await countQuery;
    if (error) throw new Error(error.message);
    return [status, count ?? 0] as const;
  });

  let allCountQuery = supabase.from("orders").select("id", { count: "exact", head: true });
  allCountQuery = withFilters(allCountQuery, { ...options, status: "all", page: requestedPage, pageSize }, "all");

  const [rowsResult, allCountResult, statusEntries] = await Promise.all([
    rowsPromise,
    allCountQuery,
    Promise.all(countPromises),
  ]);
  if (rowsResult.error) throw new Error(rowsResult.error.message);
  if (allCountResult.error) throw new Error(allCountResult.error.message);

  const total = rowsResult.count ?? allCountResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const statusCounts = Object.fromEntries(statusEntries) as Record<string, number>;
  statusCounts.all = allCountResult.count ?? 0;

  return {
    orders: decorateOrders((rowsResult.data ?? []) as RawAdminOrder[], drivers, trucks),
    total,
    page,
    pageSize,
    totalPages,
    statusCounts,
  };
}
