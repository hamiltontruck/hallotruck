import { calculateTransportQuote } from "./quote-pricing.service";
import { formatCargoLoad, validateCargoLoad, type CargoUnit } from "./customer-cargo.service";
import {
  buildCargoDescription,
  cargoDetailsCopy,
  validateCargoDetails,
  type CargoCategory,
  type PackagingType,
} from "../domain/cargo-details";
import { supabase } from "./supabase.client";

export interface AdminSmartOrderInput {
  customerName: string;
  customerPhone: string;
  cargoDescription: string;
  cargoCategory: CargoCategory;
  packagingType: PackagingType;
  cargoQuantity: number;
  cargoUnit: CargoUnit;
  vehicleType: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickup: [number, number];
  dropoff: [number, number];
  distanceKm: number;
}

const ethiopianMobilePattern = /^(?:09\d{8}|\+2519\d{8})$/;

export async function createAdminSmartOrder(input: AdminSmartOrderInput) {
  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  const cargoNotes = input.cargoDescription.trim();

  if (!customerName) throw new Error("Customer name is required.");
  if (!ethiopianMobilePattern.test(customerPhone)) throw new Error("Phone must be 09xxxxxxxx or +2519xxxxxxxx.");
  if (!input.vehicleType.trim()) throw new Error("Vehicle type is required.");
  if (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0) throw new Error("Choose a valid pickup and drop-off route first.");

  const cargoTons = validateCargoLoad(input.vehicleType, input.cargoQuantity, input.cargoUnit);
  const cargoDetailsError = validateCargoDetails({
    category: input.cargoCategory,
    packagingType: input.packagingType,
    vehicleType: input.vehicleType,
    notes: cargoNotes,
  });
  if (cargoDetailsError) throw new Error(cargoDetailsCopy.en.errors[cargoDetailsError]);

  const quote = await calculateTransportQuote(input.distanceKm, input.vehicleType, cargoTons);
  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = quote.total_quote_etb;
  const cargoDescription = buildCargoDescription({
    category: input.cargoCategory,
    packagingType: input.packagingType,
    load: formatCargoLoad(input.cargoQuantity, input.cargoUnit),
    notes: cargoNotes,
  });

  const { data, error } = await supabase
    .from("orders")
    .insert({
      tracking_id: trackingId,
      customer_name: customerName,
      customer_phone: customerPhone,
      pickup_address: input.pickupAddress.trim(),
      pickup: `POINT(${input.pickup[0]} ${input.pickup[1]})`,
      dropoff_address: input.dropoffAddress.trim(),
      dropoff: `POINT(${input.dropoff[0]} ${input.dropoff[1]})`,
      cargo_quantity: input.cargoQuantity,
      cargo_unit: input.cargoUnit,
      cargo_category: input.cargoCategory,
      packaging_type: input.packagingType,
      cargo_notes: cargoNotes || null,
      cargo_description: cargoDescription,
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
