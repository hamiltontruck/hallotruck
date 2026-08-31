export type DriverAvailableJob = {
  id: string;
  trackingId: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number | null;
  priceEtb: number | null;
  cargoDescription: string | null;
};

export type DriverTruckOption = {
  id: string;
  plateNumber: string;
  vehicleType: string;
  capacityTons: number | null;
  status: string;
};

export type DriverActiveTrip = {
  id: string;
  trackingId: string;
  status: "accepted" | "in_transit";
  pickupAddress: string;
  dropoffAddress: string;
  priceEtb: number | null;
  acceptedAt: string | null;
};

export type DriverWorkboardSnapshot = {
  activeTrip: DriverActiveTrip | null;
  availableJobs: DriverAvailableJob[];
  loadedAt: number;
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

export function normalizeDriverAvailableJobs(value: unknown): DriverAvailableJob[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const row = recordOf(entry);
    if (!row) return [];

    const id = requiredText(row.id);
    const trackingId = requiredText(row.tracking_id);
    const pickupAddress = requiredText(row.pickup_address);
    const dropoffAddress = requiredText(row.dropoff_address);
    const vehicleType = requiredText(row.vehicle_type);
    if (!id || !trackingId || !pickupAddress || !dropoffAddress || !vehicleType) return [];

    return [{
      id,
      trackingId,
      pickupAddress,
      dropoffAddress,
      vehicleType,
      distanceKm: optionalFiniteNumber(row.distance_km),
      priceEtb: optionalFiniteNumber(row.price_etb),
      cargoDescription: optionalText(row.cargo_description),
    }];
  });
}

export function normalizeDriverTruckOptions(value: unknown): DriverTruckOption[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const row = recordOf(entry);
    if (!row) return [];

    const id = requiredText(row.id);
    const plateNumber = requiredText(row.plate_number);
    const vehicleType = requiredText(row.vehicle_type);
    const status = requiredText(row.status);
    if (!id || !plateNumber || !vehicleType || !status) return [];

    return [{
      id,
      plateNumber,
      vehicleType,
      capacityTons: optionalFiniteNumber(row.capacity_tons),
      status,
    }];
  });
}

export function normalizeDriverActiveTrip(value: unknown): DriverActiveTrip | null {
  const row = recordOf(value);
  if (!row) return null;

  const id = requiredText(row.id);
  const trackingId = requiredText(row.tracking_id);
  const pickupAddress = requiredText(row.pickup_address);
  const dropoffAddress = requiredText(row.dropoff_address);
  const status = row.status === "accepted" || row.status === "in_transit" ? row.status : null;
  if (!id || !trackingId || !pickupAddress || !dropoffAddress || !status) return null;

  return {
    id,
    trackingId,
    status,
    pickupAddress,
    dropoffAddress,
    priceEtb: optionalFiniteNumber(row.price_etb),
    acceptedAt: optionalText(row.accepted_at),
  };
}
