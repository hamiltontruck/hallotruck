import { supabase } from "./supabase.client";

export type CargoUnit = "ton" | "quintal";

const vehicleRates: Record<string, number> = {
  pickup: 48,
  van: 58,
  "dry cargo": 72,
  refrigerated: 92,
  trailer: 110,
};

export const vehicleCapacityTons: Record<string, number> = {
  pickup: 3,
  van: 5,
  "dry cargo": 15,
  refrigerated: 15,
  trailer: 40,
};

export function cargoToTons(quantity: number, unit: CargoUnit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return unit === "quintal" ? quantity / 10 : quantity;
}

export function formatCargoLoad(quantity: number, unit: CargoUnit) {
  const value = Number.isInteger(quantity) ? quantity.toLocaleString() : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${value} ${unit === "quintal" ? "quintal" : "ton"}`;
}

export function calculateCargoQuote(distanceKm: number, vehicleType: string, cargoQuantity: number, cargoUnit: CargoUnit) {
  const rate = vehicleRates[vehicleType.toLowerCase()] ?? 72;
  const cargoTons = cargoToTons(cargoQuantity, cargoUnit);
  const distanceCharge = distanceKm * rate;
  const weightCharge = cargoTons * 650;
  return Math.max(1500, Math.round((distanceCharge + weightCharge + 900) / 50) * 50);
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
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  validateCargoLoad(input.vehicleType, input.cargoQuantity, input.cargoUnit);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", auth.user.id)
    .single();

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = calculateCargoQuote(input.distanceKm, input.vehicleType, input.cargoQuantity, input.cargoUnit);
  const cargoDescription = formatCargoLoad(input.cargoQuantity, input.cargoUnit);

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
    cargo_quantity: input.cargoQuantity,
    cargo_unit: input.cargoUnit,
    cargo_description: cargoDescription,
    price_etb: priceEtb,
    status: "placed",
  });

  if (error) throw new Error(error.message);
  return { trackingId, priceEtb };
}
