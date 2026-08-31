export type DriverAccountStatus = "pending" | "approved" | "rejected" | "suspended";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type VerificationDocumentKey =
  | "driver_photo"
  | "license_front"
  | "license_back"
  | "national_id_front"
  | "national_id_back"
  | "vehicle_registration"
  | "insurance"
  | "transport_permit"
  | "truck_front"
  | "truck_back"
  | "truck_side"
  | "truck_loading_area";

export type DriverProfileRecord = {
  id: string;
  fullName: string;
  phone: string;
  vehicleType: string | null;
  driverStatus: DriverAccountStatus;
  ratingAvg: number | null;
  createdAt: string | null;
};

export type DriverTruckRecord = {
  id: string;
  plateNumber: string;
  vehicleType: string;
  capacityTons: number | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DriverVerificationRecord = {
  id: string;
  documentKey: VerificationDocumentKey;
  truckId: string | null;
  status: VerificationStatus;
  expiryDate: string | null;
  rejectionReason: string | null;
  updatedAt: string | null;
};

export type DocumentHealth = "missing" | "pending" | "verified" | "rejected" | "expired";

export const identityDocumentKeys: readonly VerificationDocumentKey[] = [
  "driver_photo",
  "license_front",
  "license_back",
  "national_id_front",
  "national_id_back",
];

export const vehicleDocumentKeys: readonly VerificationDocumentKey[] = [
  "vehicle_registration",
  "insurance",
  "transport_permit",
  "truck_front",
  "truck_back",
  "truck_side",
  "truck_loading_area",
];

const documentKeySet = new Set<VerificationDocumentKey>([
  ...identityDocumentKeys,
  ...vehicleDocumentKeys,
]);

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
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

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function optionalIsoDateTime(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

function optionalDate(value: unknown): string | null {
  const text = optionalText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? null : text;
}

export function normalizeDriverProfile(value: unknown, expectedUserId?: string): DriverProfileRecord | null {
  const row = recordOf(value);
  if (!row) return null;
  const id = requiredText(row.id);
  const fullName = requiredText(row.full_name);
  const phone = requiredText(row.phone);
  const driverStatus = row.driver_status === "pending"
    || row.driver_status === "approved"
    || row.driver_status === "rejected"
    || row.driver_status === "suspended"
    ? row.driver_status
    : null;
  if (!id || !fullName || !phone || !driverStatus || (expectedUserId && id !== expectedUserId)) return null;
  return {
    id,
    fullName,
    phone,
    vehicleType: optionalText(row.vehicle_type),
    driverStatus,
    ratingAvg: optionalNumber(row.rating_avg),
    createdAt: optionalIsoDateTime(row.created_at),
  };
}

export function normalizeDriverTruck(value: unknown): DriverTruckRecord | null {
  const row = recordOf(value);
  if (!row) return null;
  const id = requiredText(row.id);
  const plateNumber = requiredText(row.plate_number);
  const vehicleType = requiredText(row.vehicle_type);
  if (!id || !plateNumber || !vehicleType) return null;
  return {
    id,
    plateNumber,
    vehicleType,
    capacityTons: optionalNumber(row.capacity_tons),
    status: optionalText(row.status),
    createdAt: optionalIsoDateTime(row.created_at),
    updatedAt: optionalIsoDateTime(row.updated_at),
  };
}

export function normalizeDriverVerification(value: unknown): DriverVerificationRecord | null {
  const row = recordOf(value);
  if (!row) return null;
  const id = requiredText(row.id);
  const documentKey = requiredText(row.document_key);
  const status = row.status === "pending" || row.status === "verified" || row.status === "rejected"
    ? row.status
    : null;
  if (!id || !documentKey || !documentKeySet.has(documentKey as VerificationDocumentKey) || !status) return null;
  const truckId = optionalText(row.truck_id);
  const isIdentity = identityDocumentKeys.includes(documentKey as VerificationDocumentKey);
  if ((isIdentity && truckId !== null) || (!isIdentity && truckId === null)) return null;
  return {
    id,
    documentKey: documentKey as VerificationDocumentKey,
    truckId,
    status,
    expiryDate: optionalDate(row.expiry_date),
    rejectionReason: optionalText(row.rejection_reason),
    updatedAt: optionalIsoDateTime(row.updated_at),
  };
}

export function documentHealth(
  record: DriverVerificationRecord | undefined,
  today = new Date(),
): DocumentHealth {
  if (!record) return "missing";
  if (record.status === "rejected") return "rejected";
  if (record.expiryDate) {
    const expiry = new Date(`${record.expiryDate}T23:59:59.999Z`);
    const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (expiry.getTime() < current.getTime()) return "expired";
  }
  return record.status;
}

export function documentProgress(
  keys: readonly VerificationDocumentKey[],
  records: readonly DriverVerificationRecord[],
  truckId: string | null,
  today = new Date(),
) {
  const selected = keys.map((key) => records.find((record) => record.documentKey === key && record.truckId === truckId));
  const verified = selected.filter((record) => documentHealth(record, today) === "verified").length;
  const submitted = selected.filter(Boolean).length;
  return { verified, submitted, total: keys.length };
}

export function formatVehicleType(value: string | null): string {
  if (!value) return "Hin galmoofne";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCapacityTons(value: number | null): string {
  if (value === null) return "—";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} ton`;
}
