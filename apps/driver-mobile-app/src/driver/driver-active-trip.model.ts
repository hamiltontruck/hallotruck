import type { DriverSelectedPaymentMethod } from "./driver-delivery-proof.model";

export type DriverActiveTripOrder = {
  id: string;
  trackingId: string;
  status: "accepted" | "in_transit";
  pickupAddress: string;
  dropoffAddress: string;
  priceEtb: number | null;
  acceptedAt: string | null;
  selectedPaymentMethod: DriverSelectedPaymentMethod;
};

export type DriverRouteStep = {
  instruction: string;
  distanceM: number;
  durationSec: number;
  location: [number, number] | null;
};

export type DriverNavigationRoute = {
  coordinates: [number, number][];
  distanceKm: number;
  durationMin: number;
  steps: DriverRouteStep[];
};

export type ProjectedRoute = {
  path: string;
  start: [number, number];
  end: [number, number];
  driver: [number, number] | null;
};

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value);
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function finiteCoordinate(value: unknown): number | null {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = finiteCoordinate(value[0]);
  const lat = finiteCoordinate(value[1]);
  if (lng === null || lat === null || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

export function normalizeDriverActiveTripOrder(value: unknown): DriverActiveTripOrder | null {
  const row = recordOf(value);
  if (!row) return null;

  const id = requiredText(row.id);
  const trackingId = requiredText(row.tracking_id);
  const pickupAddress = requiredText(row.pickup_address);
  const dropoffAddress = requiredText(row.dropoff_address);
  const status = row.status === "accepted" || row.status === "in_transit" ? row.status : null;
  const selectedPaymentMethod = row.selected_payment_method === "cash" || row.selected_payment_method === "bank_telebirr"
    ? row.selected_payment_method
    : null;
  if (!id || !trackingId || !pickupAddress || !dropoffAddress || !status || !selectedPaymentMethod) return null;

  return {
    id,
    trackingId,
    status,
    pickupAddress,
    dropoffAddress,
    priceEtb: optionalFiniteNumber(row.price_etb),
    acceptedAt: optionalText(row.accepted_at),
    selectedPaymentMethod,
  };
}

export function normalizeDriverNavigationRoute(value: unknown): DriverNavigationRoute | null {
  const row = recordOf(value);
  const geometry = recordOf(row?.geometry);
  if (!row || !geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;

  const coordinates = geometry.coordinates
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is [number, number] => coordinate !== null)
    .slice(0, 5000);
  const distanceKm = optionalFiniteNumber(row.distanceKm);
  const durationMin = optionalFiniteNumber(row.durationMin);
  if (coordinates.length < 2 || distanceKm === null || durationMin === null) return null;

  const steps = Array.isArray(row.steps)
    ? row.steps.flatMap((entry): DriverRouteStep[] => {
        const step = recordOf(entry);
        const instruction = requiredText(step?.instruction);
        const distanceM = optionalFiniteNumber(step?.distanceM);
        const durationSec = optionalFiniteNumber(step?.durationSec);
        if (!step || !instruction || distanceM === null || durationSec === null) return [];
        return [{
          instruction,
          distanceM,
          durationSec,
          location: normalizeCoordinate(step.location),
        }];
      }).slice(0, 100)
    : [];

  return { coordinates, distanceKm, durationMin, steps };
}

export function projectRouteToSvg(
  coordinates: [number, number][],
  driverPosition: [number, number] | null,
  width = 420,
  height = 560,
  padding = 42,
): ProjectedRoute | null {
  if (coordinates.length < 2 || width <= padding * 2 || height <= padding * 2) return null;

  const lngs = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngSpan = Math.max(maxLng - minLng, 0.000001);
  const latSpan = Math.max(maxLat - minLat, 0.000001);

  const project = ([lng, lat]: [number, number]): [number, number] => {
    const x = padding + ((lng - minLng) / lngSpan) * (width - padding * 2);
    const y = height - padding - ((lat - minLat) / latSpan) * (height - padding * 2);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  };

  const projected = coordinates.map(project);
  const path = projected.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const driver = driverPosition ? project(driverPosition) : null;
  return {
    path,
    start: projected[0],
    end: projected[projected.length - 1],
    driver,
  };
}

export function formatRouteDistance(distanceKm: number | null): string {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return "—";
  return distanceKm >= 100 ? `${Math.round(distanceKm).toLocaleString()} km` : `${distanceKm.toFixed(1)} km`;
}

export function formatRouteDuration(durationMin: number | null): string {
  if (durationMin === null || !Number.isFinite(durationMin)) return "—";
  const totalMinutes = Math.max(0, Math.round(durationMin));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
