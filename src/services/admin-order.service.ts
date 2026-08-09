import { calculateQuote } from "./customer.service";
import { supabase } from "./supabase.client";

export interface AdminSmartOrderInput {
  customerName: string;
  customerPhone: string;
  cargoDescription: string;
  vehicleType: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickup: [number, number];
  dropoff: [number, number];
  distanceKm: number;
}

export async function createAdminSmartOrder(input: AdminSmartOrderInput) {
  if (!input.customerName.trim()) throw new Error("Customer name is required.");
  if (!input.customerPhone.trim()) throw new Error("Customer phone is required.");
  if (!input.vehicleType.trim()) throw new Error("Vehicle type is required.");
  if (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0) throw new Error("Choose a valid pickup and drop-off route first.");

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = calculateQuote(input.distanceKm, input.vehicleType);

  const { data, error } = await supabase
    .from("orders")
    .insert({
      tracking_id: trackingId,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      pickup_address: input.pickupAddress.trim(),
      pickup: `POINT(${input.pickup[0]} ${input.pickup[1]})`,
      dropoff_address: input.dropoffAddress.trim(),
      dropoff: `POINT(${input.dropoff[0]} ${input.dropoff[1]})`,
      cargo_description: input.cargoDescription.trim() || null,
      vehicle_type: input.vehicleType,
      distance_km: input.distanceKm,
      price_etb: priceEtb,
      status: "placed",
      payment_status: "unpaid",
    })
    .select("id, tracking_id, price_etb, distance_km")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
