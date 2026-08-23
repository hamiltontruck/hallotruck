import { supabase } from "./supabase.client";
import { calculateTransportQuote } from "./quote-pricing.service";
import {
  buildCargoDescription,
  cargoDetailsCopy,
  validateCargoDetails,
  type CargoCategory,
  type PackagingType,
} from "../domain/cargo-details";

export type CargoUnit = "ton" | "quintal";

export const vehicleCapacityTons: Record<string, number> = {
  pickup: 3,
  van: 5,
  "isuzu 5 ton": 5,
  "dry cargo": 10,
  refrigerated: 15,
  "truck 22 ton": 22,
  "truck 25 ton": 25,
  "truck 30 ton": 30,
  trailer: 45,
};

export function cargoToTons(quantity: number, unit: CargoUnit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return unit === "quintal" ? quantity / 10 : quantity;
}

export function formatCargoLoad(quantity: number, unit: CargoUnit) {
  const value = Number.isInteger(quantity) ? quantity.toLocaleString() : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${value} ${unit === "quintal" ? "quintal" : "ton"}`;
}

export function validateCargoLoad(vehicleType: string, cargoQuantity: number, cargoUnit: CargoUnit) {
  const cargoTons = cargoToTons(cargoQuantity, cargoUnit);
  if (cargoTons <= 0) throw new Error("Enter a cargo amount greater than zero.");
  const capacity = vehicleCapacityTons[vehicleType.toLowerCase()];
  if (capacity && cargoTons > capacity) {
    throw new Error(`${vehicleType} supports up to ${capacity} tons. Choose a larger vehicle or reduce the load.`);
  }
  return cargoTons;
}

export async function createCustomerCargoOrder(input: {
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  pickup: [number, number];
  dropoff: [number, number];
  cargoQuantity: number;
  cargoUnit: CargoUnit;
  cargoCategory: CargoCategory;
  packagingType: PackagingType;
  cargoNotes?: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const cargoTons = validateCargoLoad(input.vehicleType, input.cargoQuantity, input.cargoUnit);
  const cargoDetailsError = validateCargoDetails({
    category: input.cargoCategory,
    packagingType: input.packagingType,
    vehicleType: input.vehicleType,
    notes: input.cargoNotes,
  });
  if (cargoDetailsError) throw new Error(cargoDetailsCopy.en.errors[cargoDetailsError]);

  const quote = await calculateTransportQuote(input.distanceKm, input.vehicleType, cargoTons);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", auth.user.id)
    .single();

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = quote.total_quote_etb;
  const cargoNotes = input.cargoNotes?.trim() || null;
  const cargoDescription = buildCargoDescription({
    category: input.cargoCategory,
    packagingType: input.packagingType,
    load: formatCargoLoad(input.cargoQuantity, input.cargoUnit),
    notes: cargoNotes,
  });

  const { data: order, error } = await supabase.from("orders").insert({
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
    cargo_quantity: input.cargoQuantity,
    cargo_unit: input.cargoUnit,
    cargo_category: input.cargoCategory,
    packaging_type: input.packagingType,
    cargo_notes: cargoNotes,
    cargo_description: cargoDescription,
    price_etb: priceEtb,
    status: "placed",
  }).select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status").single();

  if (error) throw new Error(error.message);
  return {
    id: order.id as string,
    trackingId: order.tracking_id as string,
    pickupAddress: order.pickup_address as string,
    dropoffAddress: order.dropoff_address as string,
    vehicleType: order.vehicle_type as string,
    distanceKm: Number(order.distance_km ?? input.distanceKm),
    priceEtb: Number(order.price_etb ?? priceEtb),
    status: order.status as string,
  };
}
