import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";

type Coordinate = [number, number];
type OrsGeoJsonResponse = {
  features?: Array<{
    geometry?: { type?: string; coordinates?: Coordinate[] };
    properties?: { summary?: { distance?: number; duration?: number } };
  }>;
};

type RouteResult = {
  provider: "openrouteservice";
  profile: "driving-hgv";
  distanceKm: number;
  durationMinutes: number;
  coordinates: Coordinate[];
};

type BookingBody = {
  requestId: string;
  pickupAddress: string;
  pickup: Coordinate;
  dropoffAddress: string;
  dropoff: Coordinate;
  vehicleType: string;
  cargoQuantity: number;
  cargoUnit: "ton" | "quintal";
  cargoCategory: string;
  packagingType: string;
  cargoNotes: string | null;
  paymentMethod: "cash" | "bank_telebirr";
  expectedQuoteEtb: number;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const orsDirectionsUrl = "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson";
const expandedSnapRadiusMeters = 5_000;

const cargoCategories = new Set([
  "food",
  "grain_rice",
  "cooking_oil",
  "metal_steel",
  "construction_materials",
  "general_goods",
  "other",
]);
const packagingTypes = new Set([
  "bagged",
  "drum_tank",
  "pallet",
  "loose_bulk",
  "container_20ft",
  "container_40ft",
  "other",
]);
const vehicleCapacityTons: Record<string, number> = {
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

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCoordinate(value: unknown): value is Coordinate {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [lng, lat] = value;
  return typeof lng === "number"
    && typeof lat === "number"
    && Number.isFinite(lng)
    && Number.isFinite(lat)
    && lng >= -180
    && lng <= 180
    && lat >= -90
    && lat <= 90;
}

function isOperatingCoordinate([longitude, latitude]: Coordinate) {
  return (
    (longitude >= 32.8 && longitude <= 48.1 && latitude >= 3.0 && latitude <= 15.2)
    || (longitude >= 41.6 && longitude <= 43.6 && latitude >= 10.8 && latitude <= 12.9)
    || (longitude >= 40.8 && longitude <= 51.7 && latitude >= -1.9 && latitude <= 12.3)
  );
}

function asTrimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return null;
  return clean;
}

function sameCoordinate(first: Coordinate, second: Coordinate) {
  return first[0] === second[0] && first[1] === second[1];
}

function parseBody(value: unknown): BookingBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const requestId = body.requestId;
  const pickupAddress = asTrimmedString(body.pickupAddress, 240);
  const dropoffAddress = asTrimmedString(body.dropoffAddress, 240);
  const vehicleType = asTrimmedString(body.vehicleType, 80);
  const cargoQuantity = Number(body.cargoQuantity);
  const expectedQuoteEtb = Number(body.expectedQuoteEtb);
  const cargoUnit = body.cargoUnit;
  const cargoCategory = body.cargoCategory;
  const packagingType = body.packagingType;
  const paymentMethod = body.paymentMethod;
  const cargoNotes = body.cargoNotes == null ? null : typeof body.cargoNotes === "string" ? body.cargoNotes.trim() : null;

  if (
    !isUuid(requestId)
    || !pickupAddress
    || pickupAddress.length < 2
    || !dropoffAddress
    || dropoffAddress.length < 2
    || !isCoordinate(body.pickup)
    || !isCoordinate(body.dropoff)
    || sameCoordinate(body.pickup, body.dropoff)
    || !isOperatingCoordinate(body.pickup)
    || !isOperatingCoordinate(body.dropoff)
    || !vehicleType
    || !Number.isFinite(cargoQuantity)
    || cargoQuantity <= 0
    || !Number.isFinite(expectedQuoteEtb)
    || expectedQuoteEtb <= 0
    || (cargoUnit !== "ton" && cargoUnit !== "quintal")
    || typeof cargoCategory !== "string"
    || !cargoCategories.has(cargoCategory)
    || typeof packagingType !== "string"
    || !packagingTypes.has(packagingType)
    || (paymentMethod !== "cash" && paymentMethod !== "bank_telebirr")
    || (body.cargoNotes != null && typeof body.cargoNotes !== "string")
    || (cargoNotes?.length ?? 0) > 500
  ) {
    return null;
  }

  if (cargoCategory === "other" && (cargoNotes?.length ?? 0) < 3) return null;
  if ((packagingType === "container_20ft" || packagingType === "container_40ft") && vehicleType.toLowerCase() !== "trailer") {
    return null;
  }

  const cargoTons = cargoUnit === "quintal" ? cargoQuantity / 10 : cargoQuantity;
  const capacity = vehicleCapacityTons[vehicleType.toLowerCase()];
  if (!capacity || cargoTons > capacity) return null;

  return {
    requestId,
    pickupAddress,
    pickup: body.pickup,
    dropoffAddress,
    dropoff: body.dropoff,
    vehicleType,
    cargoQuantity,
    cargoUnit,
    cargoCategory,
    packagingType,
    cargoNotes: cargoNotes || null,
    paymentMethod,
    expectedQuoteEtb,
  };
}

async function calculateTruckRoute(pickup: Coordinate, dropoff: Coordinate): Promise<RouteResult> {
  const orsApiKey = Deno.env.get("ORS_API_KEY");
  if (!orsApiKey) throw new Error("routing_unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    const requestRoute = (radiuses?: [number, number]) => fetch(orsDirectionsUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: orsApiKey,
        Accept: "application/geo+json, application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [pickup, dropoff],
        preference: "recommended",
        instructions: false,
        radiuses,
        options: { vehicle_type: "hgv" },
      }),
    });

    response = await requestRoute();
    if (!response.ok && ![401, 403, 429].includes(response.status)) {
      const providerMessage = (await response.text()).slice(0, 600);
      console.warn("Customer booking HGV route retry", response.status, providerMessage);
      response = await requestRoute([expandedSnapRadiusMeters, expandedSnapRadiusMeters]);
    }
  } catch (error) {
    console.error("Customer booking route request failed", error);
    throw new Error("routing_unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 600);
    console.error("Customer booking route provider error", response.status, providerMessage);
    throw new Error("route_not_found");
  }

  let payload: OrsGeoJsonResponse;
  try {
    payload = await response.json() as OrsGeoJsonResponse;
  } catch (error) {
    console.error("Customer booking route returned invalid JSON", error);
    throw new Error("routing_unavailable");
  }

  const feature = payload.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const distanceMeters = Number(feature?.properties?.summary?.distance);
  const durationSeconds = Number(feature?.properties?.summary?.duration);
  if (
    feature?.geometry?.type !== "LineString"
    || !Array.isArray(coordinates)
    || coordinates.length < 2
    || !coordinates.every(isCoordinate)
    || !Number.isFinite(distanceMeters)
    || distanceMeters <= 0
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) {
    throw new Error("route_not_found");
  }

  return {
    provider: "openrouteservice",
    profile: "driving-hgv",
    distanceKm: Number((distanceMeters / 1000).toFixed(1)),
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    coordinates,
  };
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Authentication required" }, 401);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id,role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Customer booking profile lookup failed", profileError);
    return json({ error: "Customer booking is temporarily unavailable" }, 503);
  }
  if (!profile || profile.role !== "customer") return json({ error: "Customer account required" }, 403);

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const body = parseBody(parsed);
  if (!body) return json({ error: "Booking details are invalid" }, 400);

  let route: RouteResult;
  try {
    route = await calculateTruckRoute(body.pickup, body.dropoff);
  } catch (error) {
    const code = error instanceof Error ? error.message : "routing_unavailable";
    if (code === "route_not_found") return json({ error: "No safe truck route could be calculated for those places" }, 422);
    return json({ error: "Truck routing is temporarily unavailable" }, 503);
  }

  const cargoTons = body.cargoUnit === "quintal" ? body.cargoQuantity / 10 : body.cargoQuantity;
  const { data: quoteData, error: quoteError } = await service.rpc("calculate_transport_quote_v2", {
    p_distance_km: route.distanceKm,
    p_vehicle_type: body.vehicleType,
    p_cargo_tons: cargoTons,
  });
  if (quoteError) {
    console.error("Customer booking quote calculation failed", quoteError);
    return json({ error: "Transport quote is temporarily unavailable" }, 503);
  }

  const quoteRow = Array.isArray(quoteData) ? quoteData[0] : quoteData;
  const quoteEtb = Number(quoteRow?.total_quote_etb);
  if (!Number.isFinite(quoteEtb) || quoteEtb <= 0) {
    console.error("Customer booking quote returned invalid total");
    return json({ error: "Transport quote is temporarily unavailable" }, 503);
  }

  if (Math.abs(quoteEtb - body.expectedQuoteEtb) > 0.01) {
    return json({
      error: "The transport price changed. Review the latest quote and confirm again.",
      code: "quote_changed",
      quoteEtb,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
    }, 409);
  }

  const { data: orderData, error: orderError } = await service.rpc("customer_create_booking_v1", {
    p_customer_id: authData.user.id,
    p_request_id: body.requestId,
    p_pickup_address: body.pickupAddress,
    p_pickup_longitude: body.pickup[0],
    p_pickup_latitude: body.pickup[1],
    p_dropoff_address: body.dropoffAddress,
    p_dropoff_longitude: body.dropoff[0],
    p_dropoff_latitude: body.dropoff[1],
    p_vehicle_type: body.vehicleType,
    p_distance_km: route.distanceKm,
    p_cargo_quantity: body.cargoQuantity,
    p_cargo_unit: body.cargoUnit,
    p_cargo_category: body.cargoCategory,
    p_packaging_type: body.packagingType,
    p_cargo_notes: body.cargoNotes,
    p_selected_payment_method: body.paymentMethod,
    p_expected_quote_etb: quoteEtb,
  });

  if (orderError) {
    console.error("Customer booking commit failed", orderError);
    const message = String(orderError.message ?? "");
    if (message.includes("already being processed")) {
      return json({ error: "Booking is already being processed", code: "booking_in_progress" }, 409);
    }
    if (message.includes("Quote changed")) {
      return json({ error: "The transport price changed. Refresh the quote and confirm again.", code: "quote_changed" }, 409);
    }
    return json({ error: "Order could not be created. Please try again." }, 500);
  }

  const order = Array.isArray(orderData) ? orderData[0] : orderData;
  if (!order?.id || !order?.tracking_id) {
    console.error("Customer booking commit returned no order");
    return json({ error: "Order could not be created. Please try again." }, 500);
  }

  return json({
    route: {
      provider: route.provider,
      profile: route.profile,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      coordinates: route.coordinates,
    },
    quote: {
      cargoTons,
      totalEtb: quoteEtb,
    },
    order: {
      id: order.id,
      trackingId: order.tracking_id,
      pickupAddress: order.pickup_address,
      dropoffAddress: order.dropoff_address,
      vehicleType: order.vehicle_type,
      distanceKm: Number(order.distance_km ?? route.distanceKm),
      priceEtb: Number(order.price_etb ?? quoteEtb),
      status: order.status,
      reused: Boolean(order.reused),
    },
  }, order.reused ? 200 : 201);
});
