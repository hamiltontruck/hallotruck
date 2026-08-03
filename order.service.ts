import { supabase } from "./supabase.client";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface QuoteResult {
  distanceKm: number;
  durationMin: number;
  priceEtb: number;
  vehicleType: string;
}

export async function getQuote(params: {
  pickup: [number, number];
  dropoff: [number, number];
  vehicleType: string;
}): Promise<QuoteResult> {
  const res = await fetch(`${FUNCTIONS_URL}/quote`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Quote failed");
  return res.json();
}

export interface CreateOrderParams {
  pickup: [number, number];
  pickupAddress: string;
  dropoff: [number, number];
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  priceEtb: number;
  cargoDescription?: string;
}

export async function createOrder(params: CreateOrderParams) {
  const res = await fetch(`${FUNCTIONS_URL}/orders`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Order creation failed");
  return res.json() as Promise<{ id: string; tracking_id: string; status: string; price_etb: number }>;
}

export interface TrackedOrder {
  id?: string; // present only when the authenticated caller owns this order
  tracking_id: string;
  status: string;
  payment_status: string;
  distance_km: number;
  price_etb: number;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  delivered_at: string | null;
}

export async function getOrderByTrackingId(trackingId: string): Promise<TrackedOrder> {
  const res = await fetch(
    `${FUNCTIONS_URL}/orders?id=${encodeURIComponent(trackingId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw new Error((await res.json()).error ?? "Order not found");
  return res.json();
}

export interface LatestPing {
  location: { coordinates: [number, number] };
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string;
}

export async function getLatestPosition(orderId: string): Promise<LatestPing | null> {
  const res = await fetch(`${FUNCTIONS_URL}/tracking?orderId=${orderId}`, {
    headers: await authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json()).error ?? "Tracking fetch failed");
  return res.json();
}

export async function submitRating(orderId: string, score: number, comment?: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required.");

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, driver_id, customer_id")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) throw new Error("Order not found.");
  if (!order.driver_id) throw new Error("No driver assigned to this order.");

  const { error } = await supabase.from("ratings").insert({
    order_id: orderId,
    customer_id: order.customer_id,
    driver_id: order.driver_id,
    score,
    comment: comment ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function getRatingForOrder(orderId: string) {
  const { data, error } = await supabase
    .from("ratings")
    .select("score, comment")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
  const res = await fetch(`${FUNCTIONS_URL}/payments`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "initiate", orderId, provider }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Payment initiation failed");
  return res.json() as Promise<{ redirectUrl?: string; ussdCode?: string; providerRef: string }>;
}
