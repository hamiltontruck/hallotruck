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

export interface PendingDriver {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: string | null;
  driver_status: string;
  created_at: string;
  driver_documents: { doc_type: string; status: string }[];
}

export async function getDriversByStatus(status: string): Promise<PendingDriver[]> {
  const res = await fetch(`${FUNCTIONS_URL}/admin-drivers?status=${status}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to fetch drivers");
  const { drivers } = await res.json();
  return drivers;
}

export async function updateDriverStatus(
  driverId: string,
  action: "approve_driver" | "reject_driver",
) {
  const res = await fetch(`${FUNCTIONS_URL}/admin-drivers`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ driverId, action }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
  return res.json();
}

export async function updateDocStatus(
  driverId: string,
  docType: string,
  action: "verify_doc" | "reject_doc",
) {
  const res = await fetch(`${FUNCTIONS_URL}/admin-drivers`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ driverId, action, docType }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
  return res.json();
}

export interface AdminOrder {
  id: string;
  tracking_id: string;
  status: string;
  payment_status: string;
  vehicle_type: string;
  distance_km: number;
  price_etb: number;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
}

export async function getAllOrders(statusFilter?: string): Promise<AdminOrder[]> {
  let query = supabase
    .from("orders")
    .select(
      "id, tracking_id, status, payment_status, vehicle_type, distance_km, price_etb, pickup_address, dropoff_address, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface KpiSummary {
  totalOrders: number;
  activeOrders: number;
  deliveredToday: number;
  revenueEtb: number;
}

export async function getKpiSummary(): Promise<KpiSummary> {
  const { data, error } = await supabase
    .from("orders")
    .select("status, price_etb, delivered_at, payment_status");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const today = new Date().toDateString();

  return {
    totalOrders: rows.length,
    activeOrders: rows.filter((r) => r.status === "accepted" || r.status === "in_transit").length,
    deliveredToday: rows.filter(
      (r) => r.status === "delivered" && r.delivered_at && new Date(r.delivered_at).toDateString() === today,
    ).length,
    revenueEtb: rows
      .filter((r) => r.payment_status === "released")
      .reduce((sum, r) => sum + Number(r.price_etb ?? 0), 0),
  };
}

export interface FleetPosition {
  order_id: string;
  tracking_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  driver_name: string | null;
  lng: number | null;
  lat: number | null;
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string | null;
}

export async function getActiveFleet(): Promise<FleetPosition[]> {
  const { data, error } = await supabase.from("active_fleet").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}
  provider: string;
  event: string;
  amount_etb: number;
  created_at: string;
  order_id: string;
}

export async function getPaymentLog(): Promise<PaymentLogRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("provider, event, amount_etb, created_at, order_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}
