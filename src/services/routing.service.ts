import { supabase } from "./supabase.client";

export interface TruckRoadRoute {
  provider: "openrouteservice";
  profile: "driving-hgv";
  requestedVehicleType: string;
  distanceKm: number;
  durationMinutes: number;
  coordinates: [number, number][];
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const functionsUrl = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined)
  ?? `${supabaseUrl}/functions/v1`;

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((part) => Number.isFinite(Number(part)));
}

export async function getTruckRoadRoute(input: {
  pickup: [number, number];
  dropoff: [number, number];
  vehicleType: string;
  signal?: AbortSignal;
}): Promise<TruckRoadRoute> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session) throw new Error("Your session expired. Sign in and try again.");

  const response = await fetch(`${functionsUrl.replace(/\/$/, "")}/quote-route`, {
    method: "POST",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickup: input.pickup,
      dropoff: input.dropoff,
      vehicleType: input.vehicleType,
    }),
  });

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Truck routing is temporarily unavailable.");
  }

  const coordinates = payload?.coordinates;
  const distanceKm = Number(payload?.distanceKm);
  const durationMinutes = Number(payload?.durationMinutes);
  if (
    payload?.provider !== "openrouteservice" ||
    payload?.profile !== "driving-hgv" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.every(isCoordinate) ||
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0 ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    throw new Error("Truck routing returned an invalid route.");
  }

  return {
    provider: "openrouteservice",
    profile: "driving-hgv",
    requestedVehicleType: String(payload.requestedVehicleType ?? input.vehicleType),
    distanceKm,
    durationMinutes,
    coordinates: coordinates as [number, number][],
  };
}
