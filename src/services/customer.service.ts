import { supabase } from "./supabase.client";

export interface CustomerOrder {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  distance_km: number | null;
  price_etb: number | null;
  status: string;
  payment_status: string;
  created_at: string;
}

export interface CustomerProof {
  order_id: string;
  recipient_name: string;
  delivery_note: string | null;
  photo_path: string;
  signature_path: string;
  delivered_at: string;
}

export interface CustomerPortalData {
  orders: CustomerOrder[];
  proofs: CustomerProof[];
}

const vehicleRates: Record<string, number> = {
  pickup: 48,
  van: 58,
  "dry cargo": 72,
  refrigerated: 92,
  trailer: 110,
};

export function calculateQuote(distanceKm: number, vehicleType: string) {
  const rate = vehicleRates[vehicleType.toLowerCase()] ?? 72;
  return Math.max(1500, Math.round((distanceKm * rate + 900) / 50) * 50);
}

export async function getCustomerPortalData(): Promise<CustomerPortalData> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, tracking_id, pickup_address, dropoff_address, vehicle_type, distance_km, price_etb, status, payment_status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = (orders ?? []).map((order) => order.id);
  if (!ids.length) return { orders: [], proofs: [] };

  const { data: proofs, error: proofError } = await supabase
    .from("delivery_proofs")
    .select("order_id, recipient_name, delivery_note, photo_path, signature_path, delivered_at")
    .in("order_id", ids);
  if (proofError) throw new Error(proofError.message);

  return { orders: orders ?? [], proofs: proofs ?? [] };
}

export async function createCustomerOrder(input: {
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  pickup: [number, number];
  dropoff: [number, number];
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", auth.user.id)
    .single();

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = calculateQuote(input.distanceKm, input.vehicleType);

  const { error } = await supabase.from("orders").insert({
    tracking_id: trackingId,
    customer_id: auth.user.id,
    customer_name: profile?.full_name ?? auth.user.email ?? "Customer",
    customer_phone: profile?.phone ?? "",
    pickup_address: input.pickupAddress.trim(),
    pickup: `POINT(${input.pickup[0]} ${input.pickup[1]})`,
    dropoff_address: input.dropoffAddress.trim(),
    dropoff: `POINT(${input.dropoff[0]} ${input.dropoff[1]})`,
    vehicle_type: input.vehicleType,
    distance_km: input.distanceKm,
    price_etb: priceEtb,
    status: "placed",
  });
  if (error) throw new Error(error.message);

  return { trackingId, priceEtb };
}

export async function openCustomerProof(path: string) {
  const { data, error } = await supabase.storage.from("delivery-proofs").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
