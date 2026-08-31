import {
  identityDocumentKeys,
  vehicleDocumentKeys,
  type DriverVerificationRecord,
  type VerificationDocumentKey,
} from "./driver-profile.model";

export const MAX_VERIFICATION_FILE_BYTES = 10 * 1024 * 1024;

export const allowedVerificationMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const allowedMimeTypeSet = new Set<string>(allowedVerificationMimeTypes);

export const photoOnlyDocumentKeys = new Set<VerificationDocumentKey>([
  "driver_photo",
  "truck_front",
  "truck_back",
  "truck_side",
  "truck_loading_area",
]);

export const expiryDocumentKeys = new Set<VerificationDocumentKey>([
  "license_front",
  "license_back",
  "vehicle_registration",
  "insurance",
  "transport_permit",
]);

export type VerificationUploadFile = {
  name: string;
  type: string;
  size: number;
};

export type VerificationUploadInput = {
  documentKey: VerificationDocumentKey;
  file: VerificationUploadFile;
  truckId: string | null;
  expiryDate?: string | null;
  today?: Date;
};

export type VerificationUploadValidation = {
  expiryDate: string | null;
  isReplacement: boolean;
};

function isIdentityKey(documentKey: VerificationDocumentKey): boolean {
  return identityDocumentKeys.includes(documentKey);
}

function isVehicleKey(documentKey: VerificationDocumentKey): boolean {
  return vehicleDocumentKeys.includes(documentKey);
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function validateVerificationUpload(input: VerificationUploadInput): VerificationUploadValidation {
  const { documentKey, file, truckId } = input;
  if (isIdentityKey(documentKey) && truckId !== null) {
    throw new Error("Driver identity document must not be linked to a truck.");
  }
  if (isVehicleKey(documentKey) && !truckId) {
    throw new Error("Choose an assigned truck before uploading this document.");
  }
  if (!file.name.trim()) throw new Error("Choose a file to upload.");
  if (!allowedMimeTypeSet.has(file.type)) {
    throw new Error("JPG, PNG, WebP or PDF file qofa galchi.");
  }
  if (photoOnlyDocumentKeys.has(documentKey) && !file.type.startsWith("image/")) {
    throw new Error("Item kun JPG, PNG ykn WebP photo ta'uu qaba.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("File duwwaa galchuun hin danda'amu.");
  }
  if (file.size > MAX_VERIFICATION_FILE_BYTES) {
    throw new Error("File verification 10 MB caaluu hin qabu.");
  }

  const expiryDate = input.expiryDate?.trim() || null;
  if (expiryDate && !expiryDocumentKeys.has(documentKey)) {
    throw new Error("Expiry date item kanaaf hin barbaachisu.");
  }
  if (expiryDate && !validIsoDate(expiryDate)) {
    throw new Error("Expiry date sirrii filadhu.");
  }
  if (expiryDate) {
    const today = input.today ?? new Date();
    const expiryDay = Date.parse(`${expiryDate}T00:00:00.000Z`);
    if (expiryDay < utcDay(today)) {
      throw new Error("Document yeroon isaa darbe upload gochuun hin danda'amu.");
    }
  }

  return { expiryDate, isReplacement: false };
}

export function cleanVerificationFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-90);
  return cleaned || "verification-file";
}

export function buildVerificationObjectPath(input: {
  userId: string;
  documentKey: VerificationDocumentKey;
  truckId: string | null;
  fileName: string;
  uniqueToken: string;
}): string {
  const userId = input.userId.trim();
  const token = input.uniqueToken.trim().replace(/[^a-zA-Z0-9_-]+/g, "");
  if (!userId || userId.includes("/")) throw new Error("Invalid Driver identity.");
  if (!token) throw new Error("Invalid upload token.");
  if (isIdentityKey(input.documentKey) && input.truckId !== null) {
    throw new Error("Identity upload scope is invalid.");
  }
  if (isVehicleKey(input.documentKey) && !input.truckId) {
    throw new Error("Vehicle upload scope is invalid.");
  }
  const scope = input.truckId ? `truck-${input.truckId}` : "identity";
  return `${userId}/${scope}/${input.documentKey}/${token}-${cleanVerificationFileName(input.fileName)}`;
}

export function uploadActionLabel(record: DriverVerificationRecord | undefined): string {
  return record ? "Jijjiiri" : "Galchi";
}

export function replacementWarning(record: DriverVerificationRecord | undefined): string | null {
  if (!record) return null;
  if (record.status === "verified") {
    return "Document mirkanaa'e kana jijjiiruun status isaa gara Pending deebisa; Admin/CEO irra deebi'ee mirkaneessa.";
  }
  if (record.status === "rejected") {
    return "Document deebi'e kana file sirrii ta'een jijjiiri. Submission haaraan Pending ta'a.";
  }
  return "Submission eeggachaa jiru kana jijjiiruun review haaraa jalqaba.";
}
