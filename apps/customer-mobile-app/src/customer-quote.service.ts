import { customerSupabase } from "./auth/customer-supabase";

export type CustomerQuotePreview = {
  pickup_label: string;
  dropoff_label: string;
  pickup: [number, number];
  dropoff: [number, number];
  vehicle_type: string;
  cargo_tons: number;
  distance_km: number;
  duration_minutes: number;
  total_quote_etb: number;
  pricing_formula: "ton_km" | "legacy";
};

type GeocodeFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
};

const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim() ?? "";
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
const functionsUrl = ((import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined)?.trim()
  || (supabaseUrl ? `${supabaseUrl}/functions/v1` : "")).replace(/\/$/, "");

function finitePositive(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} is invalid.`);
  return number;
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((part) => Number.isFinite(Number(part)));
}

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");

  const { data, error } = await client.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) {
    throw new Error("Customer session expired.");
  }
  return { client, session: data.session };
}

async function geocodePlace(query: string): Promise<{ label: string; coordinates: [number, number] }> {
  const clean = query.trim();
  if (clean.length < 2) throw new Error("Pickup fi drop-off sirriitti galchi.");
  if (!mapTilerKey) throw new Error("Map key is not configured for place search.");

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(clean)}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "om,en");
  url.searchParams.set("autocomplete", "false");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Place search is temporarily unavailable.");
  const payload = await response.json() as { features?: GeocodeFeature[] };
  const feature = payload.features?.find((item) => isCoordinate(item.center));
  if (!feature || !isCoordinate(feature.center)) throw new Error(`Bakka "${clean}" hin argamne.`);

  return {
    label: feature.place_name ?? feature.text ?? clean,
    coordinates: [Number(feature.center[0]), Number(feature.center[1])],
  };
}

export async function loadCustomerQuotePreview(userId: string, input: {
  pickupQuery: string;
  dropoffQuery: string;
  vehicleType: string;
  cargoTons: number;
}): Promise<CustomerQuotePreview> {
  const cargoTons = finitePositive(input.cargoTons, "Cargo weight");
  const { client, session } = await requireCustomerSession(userId);
  if (!functionsUrl || !supabaseAnonKey) throw new Error("Customer routing backend is not configured.");

  const [pickup, dropoff] = await Promise.all([
    geocodePlace(input.pickupQuery),
    geocodePlace(input.dropoffQuery),
  ]);

  const routeResponse = await fetch(`${functionsUrl}/quote-route`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickup: pickup.coordinates,
      dropoff: dropoff.coordinates,
      vehicleType: input.vehicleType,
    }),
  });
  const routePayload = await routeResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!routeResponse.ok) {
    throw new Error(typeof routePayload?.error === "string" ? routePayload.error : "Truck route could not be calculated.");
  }

  const distanceKm = finitePositive(routePayload?.distanceKm, "Route distance");
  const durationMinutes = finitePositive(routePayload?.durationMinutes, "Route duration");
  if (routePayload?.provider !== "openrouteservice" || routePayload?.profile !== "driving-hgv") {
    throw new Error("Truck routing returned an invalid route profile.");
  }

  const { data, error } = await client.rpc("calculate_transport_quote_v2", {
    p_distance_km: distanceKm,
    p_vehicle_type: input.vehicleType,
    p_cargo_tons: cargoTons,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Quote calculation returned no result.");

  return {
    pickup_label: pickup.label,
    dropoff_label: dropoff.label,
    pickup: pickup.coordinates,
    dropoff: dropoff.coordinates,
    vehicle_type: String(row.vehicle_type ?? input.vehicleType),
    cargo_tons: finitePositive(row.cargo_tons ?? cargoTons, "Quoted cargo weight"),
    distance_km: finitePositive(row.distance_km ?? distanceKm, "Quoted distance"),
    duration_minutes: durationMinutes,
    total_quote_etb: finitePositive(row.total_quote_etb, "Quote total"),
    pricing_formula: row.pricing_formula === "ton_km" ? "ton_km" : "legacy",
  };
}
