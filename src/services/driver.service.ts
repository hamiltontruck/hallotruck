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

export interface AvailableJob {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  distance_km: number;
  price_etb: number;
  cargo_description: string | null;
}

// Job board reads directly from Supabase (RLS-scoped) rather than a
// dedicated edge function — orders with status 'placed' and no driver
// assigned are visible to any approved driver.
export async function getAvailableJobs(): Promise<AvailableJob[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, tracking_id, pickup_address, dropoff_address, vehicle_type, distance_km, price_etb, cargo_description",
    )
    .eq("status", "placed")
    .is("driver_id", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function acceptJob(orderId: string, driverId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ driver_id: driverId, status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("driver_id", null); // prevents two drivers grabbing the same job

  if (error) throw new Error(error.message);
}

export async function markDelivered(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

export async function sendGpsPing(params: {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
}) {
  const res = await fetch(`${FUNCTIONS_URL}/tracking`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "GPS ping failed");
  return res.json();
}

export interface DriverDocStatus {
  documents: { doc_type: string; status: string; created_at: string; reviewed_at: string | null }[];
  requiredCount: number;
}

export async function getMyDocuments(): Promise<DriverDocStatus> {
  const res = await fetch(`${FUNCTIONS_URL}/driver-documents`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to fetch documents");
  return res.json();
}

export async function registerDocument(docType: string, filePath: string) {
  const res = await fetch(`${FUNCTIONS_URL}/driver-documents`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ docType, filePath }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save document");
  return res.json();
}

export async function uploadDocumentFile(driverId: string, docType: string, file: File) {
  const path = `${driverId}/${docType}-${Date.now()}.${file.name.split(".").pop()}`;
  const { error } = await supabase.storage.from("driver-documents").upload(path, file, {
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export interface NavigationStep {
  instruction: string;
  distanceM: number;
  durationSec: number;
}

export interface NavigationRoute {
  geometry: GeoJSON.LineString;
  distanceKm: number;
  durationMin: number;
  steps: NavigationStep[];
}

export async function getNavigation(orderId: string): Promise<NavigationRoute> {
  const res = await fetch(`${FUNCTIONS_URL}/navigation?orderId=${orderId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't load route");
  return res.json();
}

export interface MyOrder {
  id: string;
  tracking_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  price_etb: number;
}

export async function getMyActiveOrders(): Promise<MyOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, tracking_id, status, pickup_address, dropoff_address, price_etb")
    .in("status", ["accepted", "in_transit"])
    .order("accepted_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEarnings(): Promise<{ totalTrips: number; totalEtb: number }> {
  const { data, error } = await supabase
    .from("orders")
    .select("price_etb")
    .eq("status", "delivered")
    .eq("payment_status", "released");

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    totalTrips: rows.length,
    totalEtb: rows.reduce((sum, r) => sum + Number(r.price_etb ?? 0), 0),
  };
}
