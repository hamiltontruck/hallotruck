import { supabase } from "./supabase.client";

export interface QuotePricingRule {
  vehicle_key: string;
  vehicle_type: string;
  rate_per_ton_km: number | null;
  rate_per_km: number;
  rate_per_ton: number;
  base_fee_etb: number;
  minimum_fare_etb: number;
  market_adjustment_percent: number;
  updated_at: string;
}

export interface QuoteBreakdown {
  vehicle_type: string;
  pricing_formula: "ton_km" | "legacy";
  distance_km: number;
  cargo_tons: number;
  ton_kilometers: number;
  rate_per_ton_km: number;
  route_rate_per_ton_etb: number;
  transport_charge_etb: number;
  base_fee_etb: number;
  market_adjustment_etb: number;
  total_quote_etb: number;
  commission_etb: number;
  driver_net_etb: number;
}

type QuoteRpcRow = Record<string, unknown>;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getQuotePricingRules(): Promise<QuotePricingRule[]> {
  const { data, error } = await supabase.rpc("get_quote_pricing_rules_v2");
  if (error) throw new Error(error.message);
  return ((data ?? []) as QuoteRpcRow[]).map((row) => ({
    vehicle_key: String(row.vehicle_key),
    vehicle_type: String(row.vehicle_type),
    rate_per_ton_km: row.rate_per_ton_km == null ? null : amount(row.rate_per_ton_km),
    rate_per_km: amount(row.rate_per_km),
    rate_per_ton: amount(row.rate_per_ton),
    base_fee_etb: amount(row.base_fee_etb),
    minimum_fare_etb: amount(row.minimum_fare_etb),
    market_adjustment_percent: amount(row.market_adjustment_percent),
    updated_at: String(row.updated_at),
  }));
}

export async function updateQuotePricingRule(rule: QuotePricingRule) {
  if (!rule.rate_per_ton_km || rule.rate_per_ton_km <= 0) {
    throw new Error("Enter an ETB per ton-kilometre rate greater than zero.");
  }
  const { error } = await supabase.rpc("admin_update_quote_pricing_rule_v2", {
    p_vehicle_key: rule.vehicle_key,
    p_rate_per_ton_km: rule.rate_per_ton_km,
    p_base_fee_etb: rule.base_fee_etb,
    p_minimum_fare_etb: rule.minimum_fare_etb,
    p_market_adjustment_percent: rule.market_adjustment_percent,
  });
  if (error) throw new Error(error.message);
}

export async function calculateTransportQuote(
  distanceKm: number,
  vehicleType: string,
  cargoTons: number,
): Promise<QuoteBreakdown> {
  const { data, error } = await supabase.rpc("calculate_transport_quote_v2", {
    p_distance_km: distanceKm,
    p_vehicle_type: vehicleType,
    p_cargo_tons: cargoTons,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as QuoteRpcRow | null;
  if (!row) throw new Error("Quote calculation returned no result.");
  return {
    vehicle_type: String(row.vehicle_type),
    pricing_formula: row.pricing_formula === "ton_km" ? "ton_km" : "legacy",
    distance_km: amount(row.distance_km),
    cargo_tons: amount(row.cargo_tons),
    ton_kilometers: amount(row.ton_kilometers),
    rate_per_ton_km: amount(row.rate_per_ton_km),
    route_rate_per_ton_etb: amount(row.route_rate_per_ton_etb),
    transport_charge_etb: amount(row.transport_charge_etb),
    base_fee_etb: amount(row.base_fee_etb),
    market_adjustment_etb: amount(row.market_adjustment_etb),
    total_quote_etb: amount(row.total_quote_etb),
    commission_etb: amount(row.commission_etb),
    driver_net_etb: amount(row.driver_net_etb),
  };
}
