import {
  buildCargoDescription,
  cargoDetailsCopy,
  validateCargoDetails,
  type CargoCategory,
  type PackagingType,
} from "../../../src/domain/cargo-details";
import {
  formatCargoLoad,
  validateCargoLoad,
  type CargoUnit,
} from "../../../src/domain/cargo-load";
import { customerSupabase } from "./auth/customer-supabase";

export type CustomerPaymentMethod = "cash" | "bank_telebirr";

export type CreatedCustomerOrder = {
  id: string;
  trackingId: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  priceEtb: number;
  status: string;
};

type QuoteRow = {
  total_quote_etb?: unknown;
};

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} is invalid.`);
  return number;
}

function validCoordinate(value: [number, number]) {
  return value.length === 2 && value.every((part) => Number.isFinite(Number(part)));
}

/**
 * Customer Mobile adapter for the existing production Customer order contract.
 * It writes to the same `orders` table through the authenticated Customer session,
 * relies on the same RLS boundary, cargo validators and pricing RPC, and never uses
 * a service-role credential or a parallel order store.
 */
export async function createCustomerMobileOrder(input: {
  userId: string;
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
  paymentMethod: CustomerPaymentMethod;
  expectedQuoteEtb: number;
}): Promise<CreatedCustomerOrder> {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== input.userId) {
    throw new Error("Customer session expired.");
  }

  const pickupAddress = input.pickupAddress.trim();
  const dropoffAddress = input.dropoffAddress.trim();
  if (!pickupAddress || !dropoffAddress || !validCoordinate(input.pickup) || !validCoordinate(input.dropoff)) {
    throw new Error("Choose a valid pickup and drop-off route first.");
  }

  const distanceKm = positiveNumber(input.distanceKm, "Route distance");
  const cargoTons = validateCargoLoad(input.vehicleType, input.cargoQuantity, input.cargoUnit);
  const cargoNotes = input.cargoNotes?.trim() || null;
  const cargoDetailsError = validateCargoDetails({
    category: input.cargoCategory,
    packagingType: input.packagingType,
    vehicleType: input.vehicleType,
    notes: cargoNotes,
  });
  if (cargoDetailsError) throw new Error(cargoDetailsCopy.en.errors[cargoDetailsError]);

  const { data: quoteData, error: quoteError } = await client.rpc("calculate_transport_quote_v2", {
    p_distance_km: distanceKm,
    p_vehicle_type: input.vehicleType,
    p_cargo_tons: cargoTons,
  });
  if (quoteError) throw new Error(quoteError.message);
  const quoteRow = (Array.isArray(quoteData) ? quoteData[0] : quoteData) as QuoteRow | null;
  const priceEtb = positiveNumber(quoteRow?.total_quote_etb, "Quote total");
  const expectedQuoteEtb = positiveNumber(input.expectedQuoteEtb, "Displayed quote");
  if (Math.abs(priceEtb - expectedQuoteEtb) > 0.01) {
    throw new Error("The transport price changed. Refresh the quote and confirm again.");
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("full_name,phone")
    .eq("id", auth.user.id)
    .single();
  if (profileError) throw new Error(profileError.message);

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const cargoDescription = buildCargoDescription({
    category: input.cargoCategory,
    packagingType: input.packagingType,
    load: formatCargoLoad(input.cargoQuantity, input.cargoUnit),
    notes: cargoNotes,
  });

  const { data: order, error } = await client
    .from("orders")
    .insert({
      tracking_id: trackingId,
      customer_id: auth.user.id,
      customer_name: profile?.full_name ?? auth.user.email ?? "Customer",
      customer_phone: profile?.phone ?? "",
      pickup_address: pickupAddress,
      pickup: `POINT(${input.pickup[0]} ${input.pickup[1]})`,
      dropoff_address: dropoffAddress,
      dropoff: `POINT(${input.dropoff[0]} ${input.dropoff[1]})`,
      vehicle_type: input.vehicleType,
      distance_km: distanceKm,
      cargo_quantity: input.cargoQuantity,
      cargo_unit: input.cargoUnit,
      cargo_category: input.cargoCategory,
      packaging_type: input.packagingType,
      cargo_notes: cargoNotes,
      cargo_description: cargoDescription,
      price_etb: priceEtb,
      selected_payment_method: input.paymentMethod,
      payment_terms: "pay_driver_on_delivery",
      status: "placed",
    })
    .select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status")
    .single();

  if (error) throw new Error(error.message);
  return {
    id: order.id as string,
    trackingId: order.tracking_id as string,
    pickupAddress: order.pickup_address as string,
    dropoffAddress: order.dropoff_address as string,
    vehicleType: order.vehicle_type as string,
    distanceKm: Number(order.distance_km ?? distanceKm),
    priceEtb: Number(order.price_etb ?? priceEtb),
    status: order.status as string,
  };
}
