import { supabase } from "./supabase.client";
import { calculateTransportQuote } from "./quote-pricing.service";
import {
  buildCargoDescription,
  cargoDetailsCopy,
  validateCargoDetails,
  type CargoCategory,
  type PackagingType,
} from "../domain/cargo-details";
import {
  cargoToTons,
  formatCargoLoad,
  validateCargoLoad,
  vehicleCapacityTons,
  type CargoUnit,
} from "../domain/cargo-load";

export {
  cargoToTons,
  formatCargoLoad,
  validateCargoLoad,
  vehicleCapacityTons,
  type CargoUnit,
} from "../domain/cargo-load";

export async function createCustomerCargoOrder(input: {
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  pickup: [number, number];
  dropoff: [number, number];
  cargoQuantity: number;
  cargoUnit: CargoUnit;
  cargoCategory?: CargoCategory;
  packagingType?: PackagingType;
  cargoNotes?: string;
  paymentMethod?: "cash" | "bank_telebirr";
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const cargoCategory = input.cargoCategory ?? "general_goods";
  const packagingType = input.packagingType ?? "loose_bulk";
  const cargoNotes = input.cargoNotes?.trim() || null;
  const cargoTons = validateCargoLoad(input.vehicleType, input.cargoQuantity, input.cargoUnit);
  const cargoDetailsError = validateCargoDetails({
    category: cargoCategory,
    packagingType,
    vehicleType: input.vehicleType,
    notes: cargoNotes,
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
  const cargoDescription = buildCargoDescription({
    category: cargoCategory,
    packagingType,
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
    cargo_category: cargoCategory,
    packaging_type: packagingType,
    cargo_notes: cargoNotes,
    cargo_description: cargoDescription,
    price_etb: priceEtb,
    selected_payment_method: input.paymentMethod ?? "cash",
    payment_terms: "pay_driver_on_delivery",
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
