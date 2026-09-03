import { customerSupabase } from "./auth/customer-supabase";

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

export type CustomerTrackingAssignment = {
  order_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  driver_verified: boolean | null;
  license_verified: boolean | null;
  national_id_verified: boolean | null;
  plate_number: string | null;
  vehicle_type: string | null;
  capacity_tons: number | null;
  truck_photo_path: string | null;
  driver_photo_path: string | null;
};

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

const ACTIVE_TRACKING_STATUSES = ["accepted", "in_transit"];

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== userId) {
    throw new Error("Customer session expired.");
  }

  return client;
}

export async function loadCustomerTrackingData(userId: string): Promise<CustomerTrackingData> {
  const client = await requireCustomerSession(userId);

  const ordersResult = await client
    .from("orders")
    .select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,status,created_at")
    .eq("customer_id", userId)
    .in("status", ACTIVE_TRACKING_STATUSES)
    .order("created_at", { ascending: false });

  if (ordersResult.error) throw new Error(ordersResult.error.message);

  const orders = (ordersResult.data ?? []) as CustomerTrackingOrder[];
  const orderIds = orders.map((order) => order.id);
  if (!orderIds.length) return { orders: [], assignments: [], liveTrips: [] };

  const allowedOrderIds = new Set(orderIds);
  const assignmentResult = await client.rpc("customer_driver_assignment_cards");
  if (assignmentResult.error) throw new Error(assignmentResult.error.message);

  const assignments = ((assignmentResult.data ?? []) as CustomerTrackingAssignment[])
    .filter((assignment) => allowedOrderIds.has(assignment.order_id));

  const liveTrips = await Promise.all(orders.map(async (order) => {
    const { data, error } = await client.rpc("customer_get_live_trip", { p_order_id: order.id });
    if (error) throw new Error(error.message);

    const row = (data?.[0] ?? null) as CustomerLiveTrip | null;
    if (!row) {
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
      } satisfies CustomerLiveTrip;
    }

    if (row.order_id !== order.id) {
      throw new Error("Customer live-trip ownership mismatch.");
    }
    return row;
  }));

  return { orders, assignments, liveTrips };
}
