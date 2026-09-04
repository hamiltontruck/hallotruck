import type { Session } from "@supabase/supabase-js";
import { customerSupabase } from "./auth/customer-supabase";

export type CustomerPlaceOption = {
  label: string;
  coordinates: [number, number];
};

export type CustomerRoutePreview = {
  pickup_label: string;
  dropoff_label: string;
  pickup: [number, number];
  dropoff: [number, number];
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  route_coordinates: [number, number][];
};

export type CustomerQuotePreview = CustomerRoutePreview & {
  cargo_tons: number;
  total_quote_etb: number;
  pricing_formula: "ton_km" | "legacy";
};

type GeocodeFeature = {
  id?: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
  place_type?: string[];
};

type OperatingBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim() ?? "";
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
const functionsUrl = ((import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined)?.trim()
  || (supabaseUrl ? `${supabaseUrl}/functions/v1` : "")).replace(/\/$/, "");

const HALLO_OPERATING_BOUNDS: readonly OperatingBounds[] = [
  { west: 32.8, south: 3.0, east: 48.1, north: 15.2 },
  { west: 41.6, south: 10.8, east: 43.6, north: 12.9 },
  { west: 40.8, south: -1.9, east: 51.7, north: 12.3 },
];

const NON_ROUTABLE_PLACE_TYPES = new Set(["continental_marine", "country", "major_landform"]);

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

function isRouteCoordinates(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.length >= 2 && value.every(isCoordinate);
}

export function isHalloOperatingCoordinate(coordinates: [number, number]) {
  const [longitude, latitude] = coordinates;
  return HALLO_OPERATING_BOUNDS.some(({ west, south, east, north }) => (
    longitude >= west
    && longitude <= east
    && latitude >= south
    && latitude <= north
  ));
}

function validSelectedPlace(place: CustomerPlaceOption | null | undefined) {
  return Boolean(place?.label.trim() && isCoordinate(place.coordinates) && isHalloOperatingCoordinate(place.coordinates));
}

function featureToPlace(feature: GeocodeFeature): CustomerPlaceOption | null {
  if (!isCoordinate(feature.center)) return null;
  const coordinates: [number, number] = [Number(feature.center[0]), Number(feature.center[1])];
  if (!isHalloOperatingCoordinate(coordinates)) return null;
  if (feature.place_type?.some((type) => NON_ROUTABLE_PLACE_TYPES.has(type))) return null;
  const label = (feature.place_name ?? feature.text ?? "").trim();
  return label ? { label, coordinates } : null;
}

async function fetchGeocodeFeatures(query: string, autocomplete: boolean, signal?: AbortSignal) {
  const clean = query.trim();
  if (clean.length < 2) return [] as GeocodeFeature[];
  if (!mapTilerKey) throw new Error("Map search is not configured.");

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(clean)}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("autocomplete", autocomplete ? "true" : "false");
  url.searchParams.set("country", "et,dj,so");
  url.searchParams.set("types", [...NON_ROUTABLE_PLACE_TYPES].join(","));
  url.searchParams.set("excludeTypes", "true");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Place search is temporarily unavailable.");
  const payload = await response.json() as { features?: GeocodeFeature[] };
  return payload.features ?? [];
}

export async function searchCustomerPlaces(query: string, signal?: AbortSignal): Promise<CustomerPlaceOption[]> {
  const features = await fetchGeocodeFeatures(query, true, signal);
  const unique = new Map<string, CustomerPlaceOption>();
  for (const feature of features) {
    const place = featureToPlace(feature);
    if (place && !unique.has(place.label)) unique.set(place.label, place);
  }
  return [...unique.values()];
}

export async function reverseCustomerPlace(coordinates: [number, number], signal?: AbortSignal): Promise<CustomerPlaceOption> {
  if (!isHalloOperatingCoordinate(coordinates)) {
    throw new Error("The selected place is outside the HALLO Ethiopia–Djibouti–Somalia operating corridor.");
  }
  if (!mapTilerKey) {
    return { label: `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`, coordinates };
  }

  const url = new URL(`https://api.maptiler.com/geocoding/${coordinates[0]},${coordinates[1]}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("This map position could not be resolved to a place name.");
  const payload = await response.json() as { features?: GeocodeFeature[] };
  const label = payload.features?.[0]?.place_name ?? payload.features?.[0]?.text
    ?? `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
  return { label, coordinates };
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

async function geocodePlace(query: string): Promise<CustomerPlaceOption> {
  const clean = query.trim();
  if (clean.length < 2) throw new Error("Choose both pickup and drop-off places.");
  const features = await fetchGeocodeFeatures(clean, false);
  const place = features.map(featureToPlace).find((item): item is CustomerPlaceOption => item !== null);
  if (!place) {
    throw new Error(`"${clean}" was not found inside the HALLO Ethiopia–Djibouti–Somalia operating corridor.`);
  }
  return place;
}

async function requestHgvRoute(session: Session, input: {
  pickup: CustomerPlaceOption;
  dropoff: CustomerPlaceOption;
  vehicleType: string;
  signal?: AbortSignal;
}): Promise<CustomerRoutePreview> {
  if (!functionsUrl || !supabaseAnonKey) throw new Error("Customer routing backend is not configured.");
  if (!validSelectedPlace(input.pickup) || !validSelectedPlace(input.dropoff)) {
    throw new Error("Pickup and drop-off must be valid HALLO operating-corridor places.");
  }

  const response = await fetch(`${functionsUrl}/quote-route`, {
    method: "POST",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickup: input.pickup.coordinates,
      dropoff: input.dropoff.coordinates,
      vehicleType: input.vehicleType,
    }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Truck route could not be calculated.");
  }

  const distanceKm = finitePositive(payload?.distanceKm, "Route distance");
  const durationMinutes = finitePositive(payload?.durationMinutes, "Route duration");
  const coordinates = payload?.coordinates;
  if (
    payload?.provider !== "openrouteservice"
    || payload?.profile !== "driving-hgv"
    || !isRouteCoordinates(coordinates)
  ) {
    throw new Error("Truck routing returned an invalid HGV route.");
  }

  return {
    pickup_label: input.pickup.label,
    dropoff_label: input.dropoff.label,
    pickup: input.pickup.coordinates,
    dropoff: input.dropoff.coordinates,
    vehicle_type: String(payload.requestedVehicleType ?? input.vehicleType),
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    route_coordinates: coordinates,
  };
}

export async function loadCustomerRoutePreview(userId: string, input: {
  pickup: CustomerPlaceOption;
  dropoff: CustomerPlaceOption;
  vehicleType: string;
  signal?: AbortSignal;
}): Promise<CustomerRoutePreview> {
  const { session } = await requireCustomerSession(userId);
  return requestHgvRoute(session, input);
}

export async function loadCustomerQuotePreview(userId: string, input: {
  pickupQuery: string;
  dropoffQuery: string;
  pickupPlace?: CustomerPlaceOption | null;
  dropoffPlace?: CustomerPlaceOption | null;
  vehicleType: string;
  cargoTons: number;
}): Promise<CustomerQuotePreview> {
  const cargoTons = finitePositive(input.cargoTons, "Cargo weight");
  const { client, session } = await requireCustomerSession(userId);

  const pickup = validSelectedPlace(input.pickupPlace)
    ? input.pickupPlace as CustomerPlaceOption
    : await geocodePlace(input.pickupQuery);
  const dropoff = validSelectedPlace(input.dropoffPlace)
    ? input.dropoffPlace as CustomerPlaceOption
    : await geocodePlace(input.dropoffQuery);

  const route = await requestHgvRoute(session, {
    pickup,
    dropoff,
    vehicleType: input.vehicleType,
  });

  const { data, error } = await client.rpc("calculate_transport_quote_v2", {
    p_distance_km: route.distance_km,
    p_vehicle_type: input.vehicleType,
    p_cargo_tons: cargoTons,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Quote calculation returned no result.");

  return {
    ...route,
    vehicle_type: String(row.vehicle_type ?? route.vehicle_type),
    cargo_tons: finitePositive(row.cargo_tons ?? cargoTons, "Quoted cargo weight"),
    distance_km: finitePositive(row.distance_km ?? route.distance_km, "Quoted distance"),
    total_quote_etb: finitePositive(row.total_quote_etb, "Quote total"),
    pricing_formula: row.pricing_formula === "ton_km" ? "ton_km" : "legacy",
  };
}
