import { mobileSupabase } from "../auth/mobile-supabase";

export type CustomerMobileOrder = {
  id: string;
  tracking_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  vehicle_type: string | null;
  distance_km: number | null;
  price_etb: number | null;
  status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;
  created_at: string | null;
};

export type CustomerMobilePayment = {
  id: string;
  order_id: string;
  provider: string | null;
  provider_ref: string | null;
  amount_etb: number | null;
  event: string | null;
  created_at: string | null;
};

export type CustomerMobileAssignment = {
  order_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
  capacity_tons: number | null;
};

export type CustomerMobileWorkspaceData = {
  orders: CustomerMobileOrder[];
  payments: CustomerMobilePayment[];
  assignments: CustomerMobileAssignment[];
};

export type CustomerMobileSummary = {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalInvoicedEtb: number;
  confirmedPaidEtb: number;
  pendingVerificationEtb: number;
  remainingEtb: number;
};

export const emptyCustomerMobileWorkspaceData: CustomerMobileWorkspaceData = {
  orders: [],
  payments: [],
  assignments: [],
};

const activeStatuses = new Set(["assigned", "accepted", "in_transit"]);
const deliveredStatuses = new Set(["delivered"]);

function numericAmount(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isRejectedPayment(payment: CustomerMobilePayment) {
  const event = normalized(payment.event);
  return event.includes("reject") || event.includes("failed") || event.includes("void");
}

function isPendingPayment(payment: CustomerMobilePayment) {
  const event = normalized(payment.event);
  return event.includes("pending") || event.includes("submitted") || event.includes("review");
}

export function formatEtb(amount: number | null | undefined) {
  const value = numericAmount(amount);
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatShortEtb(amount: number | null | undefined) {
  const value = numericAmount(amount);
  if (value >= 1_000_000) return `ETB ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `ETB ${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return formatEtb(value);
}

export function summarizeCustomerMobileData(
  data: CustomerMobileWorkspaceData,
): CustomerMobileSummary {
  const totalInvoicedEtb = data.orders.reduce(
    (total, order) => total + (normalized(order.status) === "cancelled" ? 0 : numericAmount(order.price_etb)),
    0,
  );

  const confirmedPaidEtb = data.payments.reduce((total, payment) => {
    if (isRejectedPayment(payment) || isPendingPayment(payment)) return total;
    return total + numericAmount(payment.amount_etb);
  }, 0);

  const pendingVerificationEtb = data.payments.reduce((total, payment) => {
    if (!isPendingPayment(payment)) return total;
    return total + numericAmount(payment.amount_etb);
  }, 0);

  return {
    totalOrders: data.orders.length,
    activeOrders: data.orders.filter((order) => activeStatuses.has(normalized(order.status))).length,
    deliveredOrders: data.orders.filter((order) => deliveredStatuses.has(normalized(order.status))).length,
    totalInvoicedEtb,
    confirmedPaidEtb,
    pendingVerificationEtb,
    remainingEtb: Math.max(0, totalInvoicedEtb - confirmedPaidEtb - pendingVerificationEtb),
  };
}

export function findCustomerAssignment(
  data: CustomerMobileWorkspaceData,
  orderId: string | null | undefined,
) {
  if (!orderId) return null;
  return data.assignments.find((assignment) => assignment.order_id === orderId) ?? null;
}

export function orderRouteLabel(order: CustomerMobileOrder) {
  return `${order.pickup_address || "Pickup pending"} -> ${order.dropoff_address || "Drop-off pending"}`;
}

export async function loadCustomerMobileWorkspace(
  userId: string,
): Promise<CustomerMobileWorkspaceData> {
  const client = mobileSupabase;
  if (!client) throw new Error("Mobile Supabase is not configured.");

  const { data: ordersData, error: ordersError } = await client
    .from("orders")
    .select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status,payment_status,selected_payment_method,created_at")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false });

  if (ordersError) throw new Error(ordersError.message);

  const orders = (ordersData ?? []) as CustomerMobileOrder[];
  const orderIds = orders.map((order) => order.id);

  let payments: CustomerMobilePayment[] = [];
  if (orderIds.length > 0) {
    const { data: paymentData, error: paymentError } = await client
      .from("payments")
      .select("id,order_id,provider,provider_ref,amount_etb,event,created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (paymentError) throw new Error(paymentError.message);
    payments = (paymentData ?? []) as CustomerMobilePayment[];
  }

  let assignments: CustomerMobileAssignment[] = [];
  if (orderIds.length > 0) {
    const assignmentResult = await client.rpc("customer_driver_assignment_cards");
    if (!assignmentResult.error) {
      const allowedOrderIds = new Set(orderIds);
      assignments = ((assignmentResult.data ?? []) as CustomerMobileAssignment[]).filter((assignment) =>
        allowedOrderIds.has(assignment.order_id),
      );
    }
  }

  return { orders, payments, assignments };
}
