import { customerSupabase } from "./auth/customer-supabase";

export type CustomerPlaceOption = {
  label: string;
  coordinates: [number, number];
};

export type CustomerQuotePreview = {
  pickup_label: string;
  dropoff_label: string;
  pickup: [number, number];
  dropoff: [number, number];
  vehicle_type: string;
  cargo_tons: number;
  distance_km: number;
  duration_minutes: number;
  route_coordinates: [number, number][];
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
  if (!mapTilerKey) throw new Error("Map key is not configured for place search.");

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(clean)}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "6");
  url.searchParams.set("language", "om,en");
  url.searchParams.set("autocomplete", autocomplete ? "true" : "false");
  url.searchParams.set("country", "et,dj,so");

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
    throw new Error("Bakki filatame HALLO Ethiopia–Djibouti–Somalia corridor keessaa ala jira.");
  }
  if (!mapTilerKey) {
    return { label: `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`, coordinates };
  }

  const url = new URL(`https://api.maptiler.com/geocoding/${coordinates[0]},${coordinates[1]}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "om,en");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Bakka kana maqaan adda baasuun hin danda'amne.");
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
  if (clean.length < 2) throw new Error("Pickup fi drop-off sirriitti galchi.");
  const features = await fetchGeocodeFeatures(clean, false);
  const place = features.map(featureToPlace).find((item): item is CustomerPlaceOption => item !== null);
  if (!place) {
    throw new Error(`Bakka "${clean}" HALLO Ethiopia–Djibouti–Somalia corridor keessatti hin argamne.`);
  }
  return place;
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
  const routeCoordinates = routePayload?.coordinates;
  if (
    routePayload?.provider !== "openrouteservice"
    || routePayload?.profile !== "driving-hgv"
    || !isRouteCoordinates(routeCoordinates)
  ) {
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
    route_coordinates: routeCoordinates,
    total_quote_etb: finitePositive(row.total_quote_etb, "Quote total"),
    pricing_formula: row.pricing_formula === "ton_km" ? "ton_km" : "legacy",
  };
}
