import type { AdminOrder, Customer, Driver, Payment, Truck } from "../services/admin.service";

export type AdminReportRange = "today" | "7d" | "30d" | "90d" | "all";

export interface AdminIntelligenceData {
  orders: AdminOrder[];
  customers: Customer[];
  drivers: Driver[];
  trucks: Truck[];
  payments: Payment[];
}

export interface AdminPaymentSearchResult {
  payment: Payment;
  order?: AdminOrder;
  driver?: Driver;
}

function numberOf(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function matches(values: unknown[], query: string) {
  return values.some((value) => normalized(value).includes(query));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isWithinAdminReportRange(value: string | null | undefined, range: AdminReportRange, now = new Date()) {
  if (range === "all") return true;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range !== "today") start.setDate(start.getDate() - (Number.parseInt(range, 10) - 1));
  return timestamp >= start.getTime() && timestamp <= now.getTime();
}

export function searchAdminIntelligence(data: AdminIntelligenceData, rawQuery: string) {
  const query = normalized(rawQuery);
  if (!query) return { orders: [], customers: [], drivers: [], trucks: [], payments: [] as AdminPaymentSearchResult[], total: 0 };

  const orderById = new Map(data.orders.map((order) => [order.id, order]));
  const driverById = new Map(data.drivers.map((driver) => [driver.id, driver]));
  const orders = data.orders.filter((order) => matches([
    order.tracking_id, order.customer_name, order.customer_phone, order.pickup_address,
    order.dropoff_address, order.cargo_description, order.vehicle_type, order.status,
    order.payment_status,
  ], query));
  const customers = data.customers.filter((customer) => matches([
    customer.full_name, customer.phone, customer.email, customer.company_name,
    customer.is_credit_customer ? "credit customer" : "standard customer",
  ], query));
  const drivers = data.drivers.filter((driver) => matches([
    driver.full_name, driver.phone, driver.driver_status,
  ], query));
  const trucks = data.trucks.filter((truck) => matches([
    truck.plate_number, truck.vehicle_type, truck.capacity_tons, truck.status,
  ], query));
  const payments = data.payments.flatMap((payment) => {
    const order = orderById.get(payment.order_id);
    const driver = order?.driver_id ? driverById.get(order.driver_id) : undefined;
    return matches([
      payment.provider, payment.provider_ref, payment.amount_etb, payment.event,
      order?.tracking_id, order?.customer_name, order?.customer_phone,
      order?.pickup_address, order?.dropoff_address, driver?.full_name, driver?.phone,
    ], query) ? [{ payment, order, driver }] : [];
  });

  return {
    orders,
    customers,
    drivers,
    trucks,
    payments,
    total: orders.length + customers.length + drivers.length + trucks.length + payments.length,
  };
}

export function buildAdminIntelligenceReport(data: AdminIntelligenceData, range: AdminReportRange, now = new Date()) {
  const orders = data.orders.filter((order) => isWithinAdminReportRange(order.created_at, range, now));
  const payments = data.payments.filter((payment) => isWithinAdminReportRange(payment.created_at, range, now));
  const customers = data.customers.filter((customer) => isWithinAdminReportRange(customer.created_at, range, now));
  const delivered = orders.filter((order) => order.status === "delivered");
  const cancelled = orders.filter((order) => order.status === "cancelled");
  const active = orders.filter((order) => ["accepted", "in_transit"].includes(order.status));
  const unassigned = orders.filter((order) => !["delivered", "cancelled"].includes(order.status) && (!order.driver_id || !order.truck_id));
  const released = payments.filter((payment) => payment.event === "released").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const refunded = payments.filter((payment) => payment.event === "refunded").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
  const heldEscrow = payments.filter((payment) => payment.event === "held_escrow");
  const pending = payments.filter((payment) => payment.event === "initiated");
  const netRevenue = Math.max(0, released - refunded);
  const eligibleOrders = Math.max(0, orders.length - cancelled.length);

  const routeMap = new Map<string, { route: string; orders: number; delivered: number; invoiceEtb: number }>();
  for (const order of orders) {
    const route = `${order.pickup_address} → ${order.dropoff_address}`;
    const key = normalized(route);
    const current = routeMap.get(key) ?? { route, orders: 0, delivered: 0, invoiceEtb: 0 };
    current.orders += 1;
    current.delivered += order.status === "delivered" ? 1 : 0;
    current.invoiceEtb += numberOf(order.price_etb);
    routeMap.set(key, current);
  }

  const statusMap = new Map<string, number>();
  for (const order of orders) statusMap.set(order.status, (statusMap.get(order.status) ?? 0) + 1);

  const providerMap = new Map<string, { provider: string; records: number; amountEtb: number }>();
  for (const payment of payments) {
    const key = normalized(payment.provider) || "unknown";
    const current = providerMap.get(key) ?? { provider: payment.provider || "Unknown", records: 0, amountEtb: 0 };
    current.records += 1;
    current.amountEtb += numberOf(payment.amount_etb);
    providerMap.set(key, current);
  }

  const revenueTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const dayPayments = data.payments.filter((payment) => {
      const timestamp = new Date(payment.created_at).getTime();
      return Number.isFinite(timestamp) && timestamp >= date.getTime() && timestamp < next.getTime();
    });
    const dayReleased = dayPayments.filter((payment) => payment.event === "released").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
    const dayRefunded = dayPayments.filter((payment) => payment.event === "refunded").reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0);
    return { date: localDateKey(date), amountEtb: Math.max(0, dayReleased - dayRefunded) };
  });

  const completionRate = eligibleOrders ? Math.round((delivered.length / eligibleOrders) * 100) : 0;
  const assignedFleet = data.trucks.filter((truck) => truck.status === "assigned").length;
  const fleetUtilization = data.trucks.length ? Math.round((assignedFleet / data.trucks.length) * 100) : 0;

  return {
    orders,
    payments,
    customers,
    delivered,
    cancelled,
    active,
    unassigned,
    pending,
    heldEscrow,
    netRevenue,
    released,
    refunded,
    pendingEtb: pending.reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0),
    escrowEtb: heldEscrow.reduce((sum, payment) => sum + numberOf(payment.amount_etb), 0),
    invoiceEtb: orders.reduce((sum, order) => sum + numberOf(order.price_etb), 0),
    averageOrderEtb: orders.length ? Math.round(orders.reduce((sum, order) => sum + numberOf(order.price_etb), 0) / orders.length) : 0,
    completionRate,
    fleetUtilization,
    approvedDrivers: data.drivers.filter((driver) => driver.driver_status === "approved").length,
    availableTrucks: data.trucks.filter((truck) => truck.status === "available").length,
    topRoutes: [...routeMap.values()].sort((a, b) => b.orders - a.orders || b.invoiceEtb - a.invoiceEtb).slice(0, 5),
    statusBreakdown: [...statusMap.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    providerBreakdown: [...providerMap.values()].sort((a, b) => b.amountEtb - a.amountEtb),
    revenueTrend,
    attentionCount: unassigned.length + pending.length + heldEscrow.length,
  };
}
