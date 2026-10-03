import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";

type Coordinate = [number, number];

type OrsGeoJsonResponse = {
  features?: Array<{
    geometry?: {
      type?: string;
      coordinates?: Coordinate[];
    };
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
    };
  }>;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);
const orsDirectionsUrl = "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson";
const expandedSnapRadiusMeters = 5_000;
const DJIBOUTI_ADAMA_GUARD = {
  pickup: { west: 42.5, south: 10.8, east: 43.6, north: 12.9 },
  dropoff: { west: 38.8, south: 8.0, east: 39.7, north: 9.2 },
} as const;
const DJIBOUTI_ADAMA_MAX_ROUTE_KM = 850;
const DJIBOUTI_ADAMA_MAX_WEST_OVERSHOOT_DEGREES = 0.2;

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function isCoordinate(value: unknown): value is Coordinate {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [lng, lat] = value;
  if (typeof lng !== "number" || typeof lat !== "number") return false;
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function sameCoordinate(first: Coordinate, second: Coordinate) {
  return first[0] === second[0] && first[1] === second[1];
}
function insideBounds([lng, lat]: Coordinate, bounds: { west: number; south: number; east: number; north: number }) {
  return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

function routeNeedsDjiboutiAdamaGuard(pickup: Coordinate, dropoff: Coordinate) {
  return insideBounds(pickup, DJIBOUTI_ADAMA_GUARD.pickup) && insideBounds(dropoff, DJIBOUTI_ADAMA_GUARD.dropoff);
}

function routeHasWesternDetour(coordinates: Coordinate[], dropoff: Coordinate) {
  const westernLimit = dropoff[0] - DJIBOUTI_ADAMA_MAX_WEST_OVERSHOOT_DEGREES;
  return coordinates.slice(0, -1).some(([lng]) => lng < westernLimit);
}

function routeHasDestinationOvershoot(distanceMeters: number) {
  return distanceMeters / 1000 > DJIBOUTI_ADAMA_MAX_ROUTE_KM;
}


Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "JSON body must be an object" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isCoordinate(body.pickup) || !isCoordinate(body.dropoff)) {
    return json({ error: "Valid pickup and drop-off coordinates are required" }, 400);
  }
  if (sameCoordinate(body.pickup, body.dropoff)) {
    return json({ error: "Pickup and drop-off must be different places" }, 400);
  }

  const orsApiKey = Deno.env.get("ORS_API_KEY");
  if (!orsApiKey) {
    console.error("ORS_API_KEY is not configured");
    return json({ error: "Truck routing is temporarily unavailable" }, 503);
  }

  let response: Response;
  const requestRoute = (preference: "recommended", radiuses?: [number, number]) => fetch(orsDirectionsUrl, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: orsApiKey,
      Accept: "application/geo+json, application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [body.pickup, body.dropoff],
      preference,
      instructions: false,
      radiuses,
      options: { vehicle_type: "hgv" },
    }),
  });
  try {

    response = await requestRoute("recommended");
    const retryWithExpandedSnapping = !response.ok && ![401, 403, 429].includes(response.status);
    if (retryWithExpandedSnapping) {
      const providerMessage = (await response.text()).slice(0, 600);
      console.warn(
        "OpenRouteService could not snap the default HGV route; retrying with expanded snapping",
        response.status,
        providerMessage,
      );
      response = await requestRoute("recommended", [expandedSnapRadiusMeters, expandedSnapRadiusMeters]);
    }
  } catch (error) {
    console.error("OpenRouteService request failed", error);
    return json({ error: "Truck routing service is temporarily unavailable" }, 502);
  }

  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 600);
    console.error("OpenRouteService error", response.status, providerMessage);
    return json({ error: "No safe truck route could be calculated for those places" }, 502);
  }

  let payload: OrsGeoJsonResponse;
  try {
    payload = await response.json() as OrsGeoJsonResponse;
  } catch (error) {
    console.error("OpenRouteService returned invalid JSON", error);
    return json({ error: "Truck routing service returned an invalid response" }, 502);
  }

  let feature = payload.features?.[0];
  let coordinates = feature?.geometry?.coordinates;
  let distanceMeters = Number(feature?.properties?.summary?.distance);
  let durationSeconds = Number(feature?.properties?.summary?.duration);
  const directDjiboutiAdama = routeNeedsDjiboutiAdamaGuard(body.pickup, body.dropoff);
  const guardedRoute = directDjiboutiAdama || routeNeedsDjiboutiAdamaGuard(body.dropoff, body.pickup);
  const adamaEndpoint = directDjiboutiAdama ? body.dropoff : body.pickup;
  const isRouteAcceptable = () => Array.isArray(coordinates)
    && coordinates.every(isCoordinate)
    && (!guardedRoute || (!routeHasWesternDetour(coordinates, adamaEndpoint) && !routeHasDestinationOvershoot(distanceMeters)));

  if (
    feature?.geometry?.type !== "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.every(isCoordinate) ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !isRouteAcceptable()
  ) {
    return json({ error: "No truck route was found between those places" }, 404);
  }

  return json({
    provider: "openrouteservice",
    profile: "driving-hgv",
    requestedVehicleType: String(body.vehicleType ?? "Truck"),
    distanceKm: Number((distanceMeters / 1000).toFixed(1)),
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    coordinates,
  });
});
