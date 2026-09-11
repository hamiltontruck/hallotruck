import { customerSupabase } from "./auth/customer-supabase";
import { loadCustomerAssignments, type CustomerMobileAssignment } from "./customer-assignment.service";

export type CustomerTrackingOrder = {
  id: string;
  tracking_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  vehicle_type: string | null;
  distance_km: number | null;
  status: string | null;
  created_at: string | null;
};

export type CustomerTrackingAssignment = CustomerMobileAssignment;

export type CustomerLiveTrip = {
  order_id: string;
  status: string | null;
  pickup_lng: number | null;
  pickup_lat: number | null;
  dropoff_lng: number | null;
  dropoff_lat: number | null;
  truck_lng: number | null;
  truck_lat: number | null;
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string | null;
};

export type CustomerTrackingData = {
  orders: CustomerTrackingOrder[];
  assignments: CustomerTrackingAssignment[];
  liveTrips: CustomerLiveTrip[];
};

const ACTIVE_TRACKING_STATUSES = new Set(["assigned", "accepted", "in_transit"]);
const OPENABLE_TRACKING_STATUSES = new Set(["assigned", "accepted", "in_transit", "delivered"]);

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== userId) throw new Error("Customer session expired.");
  return client;
}

export async function loadCustomerTrackingData(userId: string, preferredOrderId?: string | null): Promise<CustomerTrackingData> {
  const client = await requireCustomerSession(userId);
  const ordersResult = await client
    .from("orders")
    .select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,status,created_at")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false });
  if (ordersResult.error) throw new Error(ordersResult.error.message);

  const ownedOrders = (ordersResult.data ?? []) as CustomerTrackingOrder[];
  const orders = preferredOrderId
    ? ownedOrders.filter((order) => order.id === preferredOrderId && OPENABLE_TRACKING_STATUSES.has(order.status || ""))
    : ownedOrders.filter((order) => ACTIVE_TRACKING_STATUSES.has(order.status || ""));
  const orderIds = orders.map((order) => order.id);
  if (!orderIds.length) return { orders: [], assignments: [], liveTrips: [] };

  const allowedOrderIds = new Set(orderIds);
  const assignments = (await loadCustomerAssignments(userId, orderIds))
    .filter((assignment) => allowedOrderIds.has(assignment.order_id));

  const liveTrips = await Promise.all(orders.map(async (order) => {
    const { data, error } = await client.rpc("customer_get_live_trip", { p_order_id: order.id });
    if (error) throw new Error(error.message);
    const row = (data?.[0] ?? null) as CustomerLiveTrip | null;
    if (!row) return emptyLiveTrip(order);
    if (row.order_id !== order.id || !allowedOrderIds.has(row.order_id)) throw new Error("Customer live-trip ownership mismatch.");
    return row;
  }));

  return { orders, assignments, liveTrips };
}

function emptyLiveTrip(order: CustomerTrackingOrder): CustomerLiveTrip {
  return {
    order_id: order.id,
    status: order.status,
    pickup_lng: null,
    pickup_lat: null,
    dropoff_lng: null,
    dropoff_lat: null,
    truck_lng: null,
    truck_lat: null,
    heading: null,
    speed_kmh: null,
    recorded_at: null,
  };
}

export async function subscribeCustomerTracking(userId: string, orderId: string, onChange: () => void) {
  const client = await requireCustomerSession(userId);
  const channel = client.channel(`customer-mobile-trip:${userId}:${orderId}`);

  channel.on("postgres_changes", {
    event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}`,
  }, onChange);
  channel.on("postgres_changes", {
    event: "INSERT", schema: "public", table: "tracking_pings", filter: `order_id=eq.${orderId}`,
  }, onChange);
  channel.on("postgres_changes", {
    event: "INSERT", schema: "public", table: "delivery_proofs", filter: `order_id=eq.${orderId}`,
  }, onChange);
  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
