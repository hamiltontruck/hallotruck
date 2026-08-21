import { supabase } from "./supabase.client";
import {
  calculateTransportQuote,
  getQuotePricingRules,
  type QuotePricingRule,
} from "./quote-pricing.service";

export type CargoUnit = "ton" | "quintal";

type CachedPricingRule = Pick<
  QuotePricingRule,
  "rate_per_ton_km" | "rate_per_km" | "rate_per_ton" | "market_adjustment_percent"
>;

const defaultPricing: Record<string, CachedPricingRule> = {
  pickup: { rate_per_ton_km: null, rate_per_km: 48, rate_per_ton: 650, market_adjustment_percent: 0 },
  van: { rate_per_ton_km: null, rate_per_km: 58, rate_per_ton: 650, market_adjustment_percent: 0 },
  "isuzu 5 ton": { rate_per_ton_km: null, rate_per_km: 58, rate_per_ton: 650, market_adjustment_percent: 0 },
  "dry cargo": { rate_per_ton_km: null, rate_per_km: 72, rate_per_ton: 650, market_adjustment_percent: 0 },
  refrigerated: { rate_per_ton_km: null, rate_per_km: 92, rate_per_ton: 650, market_adjustment_percent: 0 },
  "truck 22 ton": { rate_per_ton_km: 22.222222, rate_per_km: 110, rate_per_ton: 650, market_adjustment_percent: 0 },
  "truck 25 ton": { rate_per_ton_km: 22.222222, rate_per_km: 110, rate_per_ton: 650, market_adjustment_percent: 0 },
  "truck 30 ton": { rate_per_ton_km: 22.222222, rate_per_km: 110, rate_per_ton: 650, market_adjustment_percent: 0 },
  trailer: { rate_per_ton_km: null, rate_per_km: 110, rate_per_ton: 650, market_adjustment_percent: 0 },
};

let pricingCache: Record<string, CachedPricingRule> = { ...defaultPricing };
let pricingLoad: Promise<void> | null = null;

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

export async function refreshQuotePricing() {
  const rules = await getQuotePricingRules();
  if (!rules.length) return;
  pricingCache = Object.fromEntries(rules.map((rule) => [rule.vehicle_key, {
    rate_per_ton_km: rule.rate_per_ton_km,
    rate_per_km: rule.rate_per_km,
    rate_per_ton: rule.rate_per_ton,
    market_adjustment_percent: rule.market_adjustment_percent,
  }]));
}

function warmQuotePricing() {
  if (!pricingLoad) {
    pricingLoad = refreshQuotePricing()
      .catch(() => undefined)
      .finally(() => { pricingLoad = null; });
  }
}

warmQuotePricing();

export function cargoToTons(quantity: number, unit: CargoUnit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return unit === "quintal" ? quantity / 10 : quantity;
}

export function formatCargoLoad(quantity: number, unit: CargoUnit) {
  const value = Number.isInteger(quantity) ? quantity.toLocaleString() : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${value} ${unit === "quintal" ? "quintal" : "ton"}`;
}

export function calculateCargoQuote(distanceKm: number, vehicleType: string, cargoQuantity: number, cargoUnit: CargoUnit) {
  warmQuotePricing();
  const rule = pricingCache[vehicleType.toLowerCase()] ?? pricingCache["dry cargo"] ?? defaultPricing["dry cargo"];
  const cargoTons = cargoToTons(cargoQuantity, cargoUnit);
  const transportCharge = rule.rate_per_ton_km && rule.rate_per_ton_km > 0
    ? distanceKm * cargoTons * rule.rate_per_ton_km
    : (distanceKm * rule.rate_per_km) + (cargoTons * rule.rate_per_ton);
  const adjusted = transportCharge * (1 + rule.market_adjustment_percent / 100);
  return Math.max(0, Math.round(adjusted / 50) * 50);
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

  const cargoTons = validateCargoLoad(input.vehicleType, input.cargoQuantity, input.cargoUnit);
  const quote = await calculateTransportQuote(input.distanceKm, input.vehicleType, cargoTons);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", auth.user.id)
    .single();

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = quote.total_quote_etb;
  const cargoDescription = formatCargoLoad(input.cargoQuantity, input.cargoUnit);

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
