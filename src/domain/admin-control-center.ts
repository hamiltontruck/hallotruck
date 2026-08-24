import type {
  ControlCenterData,
  ControlDocument,
  ControlOrder,
  ControlPayment,
} from "../services/admin-control-center.service";

const ACTIVE_ORDER_STATUSES = new Set(["accepted", "in_transit"]);
const ACTIVE_DRIVER_STATUSES = new Set(["active", "available", "online", "busy", "approved"]);
const MAINTENANCE_STATUSES = new Set(["maintenance", "service_due", "out_of_service", "inspection_due"]);

export function sameLocalDay(value: string | null | undefined, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function isDelayedOrder(order: ControlOrder, nowMs = Date.now()) {
  if (!ACTIVE_ORDER_STATUSES.has(order.status)) return false;
  const startedAt = new Date(order.accepted_at || order.created_at).getTime();
  return Number.isFinite(startedAt) && nowMs - startedAt > 48 * 60 * 60 * 1000;
}

export function isLegacyCompletedPayment(payment: ControlPayment) {
  return payment.event === "released" && payment.raw_payload?.legacy_completed === true;
}

export function canonicalPayments(payments: ControlPayment[]) {
  const seen = new Set<string>();
  return payments.filter((payment) => {
    const reference = payment.provider_ref?.trim().toLowerCase() || payment.id;
    const key = [
      payment.order_id,
      payment.event,
      payment.provider.trim().toLowerCase(),
      reference,
      Number(payment.amount_etb || 0),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function paymentNet(payments: ControlPayment[]) {
  return canonicalPayments(payments).reduce((sum, payment) => {
    const amount = Math.max(0, Number(payment.amount_etb || 0));
    if (payment.event === "released") return sum + amount;
    if (payment.event === "refunded") return sum - amount;
    return sum;
  }, 0);
}

export function isComplianceAlert(document: ControlDocument, now = new Date()) {
  if (["pending", "rejected", "expired"].includes(document.status)) return true;
  if (!document.expiry_date) return false;
  const expiry = new Date(document.expiry_date).getTime();
  const days30 = 30 * 24 * 60 * 60 * 1000;
  return Number.isFinite(expiry) && expiry <= now.getTime() + days30;
}

export function buildControlCenterView(data: ControlCenterData, now = new Date()) {
  const payments = canonicalPayments(data.payments);
  const activeTrips = data.orders.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status));
  const delayedTrips = activeTrips.filter((order) => isDelayedOrder(order, now.getTime()));
  const unassignedOrders = data.orders.filter((order) =>
    !["delivered", "cancelled"].includes(order.status) && (!order.driver_id || !order.truck_id),
  );
  const pendingPayments = payments.filter((payment) => payment.event === "initiated");
  const failedOrRefundedPayments = payments.filter((payment) => ["failed", "refunded"].includes(payment.event));
  const legacyPayments = payments.filter(isLegacyCompletedPayment);
  const legacyOrderIds = new Set(legacyPayments.map((payment) => payment.order_id));
  const proofOrderIds = new Set(data.proofs.map((proof) => proof.order_id));
  const missingEvidenceOrders = data.orders.filter((order) =>
    order.status === "delivered"
    && !proofOrderIds.has(order.id)
    && !legacyOrderIds.has(order.id),
  );
  const complianceAlerts = data.documents.filter((document) => isComplianceAlert(document, now));
  const driverOnboardingAlerts = data.drivers.filter((driver) =>
    !["approved", "suspended"].includes((driver.driver_status || "").toLowerCase()),
  );
  const maintenanceAlerts = data.trucks.filter((truck) => MAINTENANCE_STATUSES.has(truck.status));
  const todayPayments = payments.filter((payment) => sameLocalDay(payment.created_at, now));

  return {
    payments,
    activeTrips,
    delayedTrips,
    unassignedOrders,
    pendingPayments,
    failedOrRefundedPayments,
    legacyPayments,
    legacyOrderIds,
    missingEvidenceOrders,
    complianceAlerts,
    driverOnboardingAlerts,
    maintenanceAlerts,
    todayRevenue: Math.max(0, paymentNet(todayPayments)),
    todayOrders: data.orders.filter((order) => sameLocalDay(order.created_at, now)),
    deliveredToday: data.orders.filter((order) => order.status === "delivered" && sameLocalDay(order.delivered_at, now)),
    availableTrucks: data.trucks.filter((truck) => truck.status === "available"),
    activeDrivers: data.drivers.filter((driver) => ACTIVE_DRIVER_STATUSES.has((driver.driver_status || "").toLowerCase())),
    activeCustomersToday: data.customers.filter((customer) => sameLocalDay(customer.created_at, now)),
  };
}
