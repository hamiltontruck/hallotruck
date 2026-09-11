import { supabase } from "./supabase.client";
import type { AdminOrder, Driver, Truck } from "./admin.service";

export const ADMIN_ORDERS_PAGE_SIZE = 100;

export const ADMIN_ORDER_STATUSES = ["all", "placed", "quoted", "accepted", "in_transit", "delivered", "cancelled"] as const;
export type AdminOrderStatusFilter = (typeof ADMIN_ORDER_STATUSES)[number];

export type AdminOrdersQuery = {
  page?: number;
  pageSize?: 50 | 100;
  status?: string;
  search?: string;
  date?: "all" | "today";
};

export type AdminOrdersPage = {
  orders: AdminOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
};

const orderColumns = "id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,cargo_description,vehicle_type,price_etb,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,cancellation_reason,cancellation_source,cancelled_at,created_at";

function normalizePage(value: number | undefined) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

function normalizePageSize(value: number | undefined): 50 | 100 {
  return value === 50 ? 50 : 100;
}

function normalizeStatus(value: string | undefined) {
  return ADMIN_ORDER_STATUSES.includes((value || "all") as AdminOrderStatusFilter) ? (value || "all") : "all";
}

function safeSearchTerm(value: string | undefined) {
  return (value || "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function applyFilters<T>(query: T, input: AdminOrdersQuery) {
  let next = query as T & {
    eq: (column: string, value: string) => typeof next;
    gte: (column: string, value: string) => typeof next;
    lt: (column: string, value: string) => typeof next;
    or: (filters: string) => typeof next;
  };
  const status = normalizeStatus(input.status);
  if (status !== "all") next = next.eq("status", status);

  if (input.date === "today") {
    const { start, end } = todayRange();
    next = next.gte("created_at", start).lt("created_at", end);
  }

  const search = safeSearchTerm(input.search);
  if (search) {
    const pattern = `*${search}*`;
    next = next.or([
      `tracking_id.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `customer_phone.ilike.${pattern}`,
      `pickup_address.ilike.${pattern}`,
      `dropoff_address.ilike.${pattern}`,
      `vehicle_type.ilike.${pattern}`,
      `cargo_description.ilike.${pattern}`,
    ].join(","));
  }
  return next;
}

async function fetchStatusCounts() {
  const statuses = ADMIN_ORDER_STATUSES.filter((status) => status !== "all");
  const results = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }),
    ...statuses.map((status) => supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", status)),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = { all: results[0].count ?? 0 };
  statuses.forEach((status, index) => { counts[status] = results[index + 1].count ?? 0; });
  return counts;
}

export async function getAdminOrdersPage(input: AdminOrdersQuery = {}): Promise<AdminOrdersPage> {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let ordersQuery = supabase
    .from("orders")
    .select(orderColumns, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  ordersQuery = applyFilters(ordersQuery, input);

  const [ordersResult, statusCounts] = await Promise.all([
    ordersQuery.range(from, to),
    fetchStatusCounts(),
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);

  const rawOrders = (ordersResult.data ?? []) as Omit<AdminOrder, "driver_name" | "plate_number" | "assignment_label">[];
  const driverIds = [...new Set(rawOrders.map((order) => order.driver_id).filter((id): id is string => Boolean(id)))];
  const truckIds = [...new Set(rawOrders.map((order) => order.truck_id).filter((id): id is string => Boolean(id)))];

  const [driversResult, trucksResult] = await Promise.all([
    driverIds.length
      ? supabase.from("profiles").select("id,full_name,phone,driver_status").in("id", driverIds)
      : Promise.resolve({ data: [], error: null }),
    truckIds.length
      ? supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,created_at").in("id", truckIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (driversResult.error) throw new Error(driversResult.error.message);
  if (trucksResult.error) throw new Error(trucksResult.error.message);

  const drivers = (driversResult.data ?? []) as Driver[];
  const trucks = (trucksResult.data ?? []) as Truck[];
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const truckById = new Map(trucks.map((truck) => [truck.id, truck]));

  const orders = rawOrders.map((order) => {
    const driver = order.driver_id ? driverById.get(order.driver_id) : undefined;
    const truck = order.truck_id ? truckById.get(order.truck_id) : undefined;
    const driverName = driver?.full_name?.trim() || driver?.phone?.trim() || null;
    const plateNumber = truck?.plate_number?.trim() || null;
    return {
      ...order,
      cargo_description: order.cargo_description?.trim() || order.vehicle_type,
      driver_name: driverName,
      plate_number: plateNumber,
      assignment_label: driverName || plateNumber
        ? `${driverName ?? "Driver profile unavailable"} · ${plateNumber ?? "Plate unavailable"}`
        : "Driver and truck not assigned",
    } satisfies AdminOrder;
  });

  const total = ordersResult.count ?? 0;
  return {
    orders,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    statusCounts,
  };
}
